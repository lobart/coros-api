import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorosConfigService } from '../coros/coros.config';
import { WorkoutMappingStore } from './workout-mapping.store';

describe('WorkoutMappingStore', () => {
  let directory: string;
  let store: WorkoutMappingStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coros-mappings-'));
    vi.stubEnv('COROS_SESSION_STORAGE_PATH', join(directory, 'sessions.enc'));
    store = new WorkoutMappingStore(new CorosConfigService());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it('preserves the canonical snapshot and lists scheduled workouts by account and date', async () => {
    await store.save({
      accountId: 'athlete-a',
      idempotencyKey: 'key-a',
      externalSource: 'perfplan',
      externalWorkoutId: 'plan-a',
      workoutId: 'coros-a',
      contentHash: 'hash-a',
      managedBy: 'external',
      state: 'confirmed',
      scheduledDate: '2026-07-27',
      workoutSnapshot: {
        sport: 'run',
        name: 'Intervals',
        steps: [{ kind: 'work', durationType: 'time', durationValue: 300 }],
      },
    });
    await store.save({
      accountId: 'athlete-b',
      idempotencyKey: 'key-b',
      externalSource: 'perfplan',
      externalWorkoutId: 'plan-b',
      workoutId: 'coros-b',
      contentHash: 'hash-b',
      managedBy: 'external',
      state: 'confirmed',
      scheduledDate: '2026-07-27',
    });

    const result = await store.listScheduled('athlete-a', '2026-07-27', '2026-08-02');

    expect(result).toHaveLength(1);
    expect(result[0]?.workoutSnapshot?.name).toBe('Intervals');
  });

  it('atomically replaces a provider ID while retaining the original idempotency key', async () => {
    await store.save({
      accountId: 'athlete-a',
      idempotencyKey: 'original',
      externalSource: 'perfplan',
      externalWorkoutId: 'plan-a',
      workoutId: 'old-id',
      contentHash: 'old-hash',
      managedBy: 'external',
      state: 'confirmed',
    });

    await store.replace('athlete-a', 'old-id', {
      idempotencyKey: 'original',
      externalSource: 'perfplan',
      externalWorkoutId: 'plan-a',
      workoutId: 'new-id',
      contentHash: 'new-hash',
      managedBy: 'external',
      state: 'confirmed',
    });

    expect(await store.findByWorkout('athlete-a', 'old-id')).toBeNull();
    expect(await store.find('athlete-a', 'original')).toMatchObject({
      workoutId: 'new-id',
      contentHash: 'new-hash',
    });
  });
});
