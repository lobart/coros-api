import { describe, expect, it, vi } from 'vitest';
import { CorosConfigService } from '../coros/coros.config';
import { ProtocolCapabilitiesService } from './protocol-capabilities.service';

describe('ProtocolCapabilitiesService', () => {
  it('does not expose library CRUD from a schedule-only fixture', async () => {
    vi.stubEnv('COROS_PROTOCOL_FIXTURE_PATH', 'fixtures/protocol');
    const capabilities = await new ProtocolCapabilitiesService(new CorosConfigService()).forRegion('eu');
    expect(capabilities.createWorkout).toBe(false);
    expect(capabilities.updateWorkout).toBe(false);
    expect(capabilities.deleteWorkout).toBe(false);
    expect(capabilities.scheduleWorkout).toBe(false);
    expect(capabilities.protocolVersion).toBe('training-hub-web-v1');
    vi.unstubAllEnvs();
  });

  it('returns no capabilities when a region has no confirmed fixtures', async () => {
    const capabilities = await new ProtocolCapabilitiesService(new CorosConfigService()).forRegion('cn');
    expect(capabilities).toEqual(
      expect.objectContaining({
        createWorkout: false,
        scheduleWorkout: false,
        protocolVersion: 'unconfirmed',
      }),
    );
  });
});
