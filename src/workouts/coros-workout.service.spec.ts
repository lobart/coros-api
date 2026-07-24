import { describe, expect, it, vi } from 'vitest';
import type { CorosConfigService } from '../coros/coros.config';
import type { AccountLockService } from '../session/account-lock.service';
import type { CorosSessionStore } from '../session/coros-session';
import { CorosWorkoutClient } from './coros-workout.client';
import { CorosWorkoutService } from './coros-workout.service';
import type { CorosWriteCapabilities } from './domain/coros-write-capabilities';
import { CorosWorkoutMapper } from './mappers/coros-workout.mapper';
import type { ProtocolCapabilitiesService } from './protocol-capabilities.service';
import type { WorkoutAuditService } from './workout-audit.service';
import type { WorkoutMappingStore } from './workout-mapping.store';

const capabilities: CorosWriteCapabilities = {
  createWorkout: true,
  updateWorkout: false,
  replaceWorkout: true,
  copyWorkout: true,
  copyWeek: true,
  estimateWorkout: true,
  trainingLoad: true,
  deleteWorkout: true,
  scheduleWorkout: true,
  unscheduleWorkout: false,
  createTrainingPlan: false,
  updateTrainingPlan: false,
  repeatBlocks: true,
  nestedRepeats: false,
  openSteps: false,
  paceTargets: false,
  heartRateTargets: true,
  powerTargets: true,
  cadenceTargets: false,
  supportedSports: ['run', 'indoor_run', 'trail_run', 'bike', 'indoor_bike'],
  protocolVersion: 'test',
};

function service(options: { request?: ReturnType<typeof vi.fn>; mapping?: Record<string, unknown> | null } = {}) {
  const request = options.request ?? vi.fn();
  const mapping = options.mapping ?? null;
  const sessions: CorosSessionStore = {
    load: vi.fn(async () => ({
      accountId: 'athlete-a',
      region: 'eu' as const,
      accountUserId: 'user-a',
      accessToken: 'secret',
      createdAt: '2026-07-24T00:00:00.000Z',
      validatedAt: '2026-07-24T00:00:00.000Z',
      protocolVersion: 'test',
    })),
    save: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
  const mappings = {
    findByWorkout: vi.fn(async () => mapping),
  };
  return {
    request,
    instance: new CorosWorkoutService(
      { writeApiEnabled: true } as CorosConfigService,
      { request } as unknown as CorosWorkoutClient,
      new CorosWorkoutMapper(),
      { forRegion: vi.fn(async () => capabilities) } as unknown as ProtocolCapabilitiesService,
      mappings as unknown as WorkoutMappingStore,
      { record: vi.fn() } as unknown as WorkoutAuditService,
      { runExclusive: vi.fn(async (_key, action) => await action()) } as unknown as AccountLockService,
      sessions,
    ),
  };
}

describe('CorosWorkoutService transfer and estimate', () => {
  it('copies the exact managed snapshot without lossy provider readback', async () => {
    const snapshot = {
      sport: 'run' as const,
      name: '3 x 5 min',
      steps: [
        {
          kind: 'repeat' as const,
          repeatCount: 3,
          steps: [{ kind: 'work' as const, durationType: 'time' as const, durationValue: 300 }],
        },
      ],
    };
    const { instance, request } = service({
      mapping: {
        state: 'confirmed',
        workoutId: 'source-id',
        workoutSnapshot: snapshot,
      },
    });

    const clipboard = await instance.copyWorkout('athlete-a', 'source-id');

    expect(clipboard.workout).toEqual(snapshot);
    expect(request).not.toHaveBeenCalled();
  });

  it('normalizes COROS calculated duration, distance and training load', async () => {
    const request = vi.fn(async () => ({
      planDuration: 3600,
      planDistance: '4200000',
      planTrainingLoad: 78,
      planSets: 1,
    }));
    const { instance } = service({ request });

    const result = await instance.estimateWorkout('athlete-a', {
      requested_metric: 'distance',
      workout: {
        sport: 'run',
        name: 'Easy run',
        steps: [{ kind: 'work', durationType: 'time', durationValue: 3600 }],
      },
    });

    expect(result).toMatchObject({
      durationSeconds: 3600,
      distanceMeters: 42_000,
      trainingLoad: 78,
      sets: 1,
    });
    expect(request).toHaveBeenCalledWith(
      'athlete-a',
      'POST',
      '/training/program/calculate',
      expect.objectContaining({ body: expect.any(Object) }),
    );
  });

  it('does not replace a workout that is still scheduled', async () => {
    const { instance, request } = service({
      mapping: {
        state: 'confirmed',
        workoutId: 'source-id',
        scheduledDate: '2026-07-27',
        externalSource: 'perfplan',
        externalWorkoutId: 'plan-a',
        idempotencyKey: 'plan-a',
      },
    });

    await expect(
      instance.replaceWorkout('athlete-a', 'source-id', {
        sport: 'run',
        name: 'Updated',
        steps: [{ kind: 'work', durationType: 'time', durationValue: 1800 }],
      }),
    ).rejects.toMatchObject({ code: 'COROS_WRITE_CAPABILITY_UNAVAILABLE' });
    expect(request).not.toHaveBeenCalled();
  });
});
