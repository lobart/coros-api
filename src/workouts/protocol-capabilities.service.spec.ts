import { describe, expect, it, vi } from 'vitest';
import { CorosConfigService } from '../coros/coros.config';
import { ProtocolCapabilitiesService } from './protocol-capabilities.service';

describe('ProtocolCapabilitiesService', () => {
  it('exposes only operations confirmed by the current EU fixtures', async () => {
    vi.stubEnv('COROS_PROTOCOL_FIXTURE_PATH', 'fixtures/protocol');
    const capabilities = await new ProtocolCapabilitiesService(new CorosConfigService()).forRegion('eu');
    expect(capabilities.createWorkout).toBe(true);
    expect(capabilities.updateWorkout).toBe(false);
    expect(capabilities.deleteWorkout).toBe(true);
    expect(capabilities.scheduleWorkout).toBe(true);
    expect(capabilities.repeatBlocks).toBe(true);
    expect(capabilities.heartRateTargets).toBe(true);
    expect(capabilities.powerTargets).toBe(true);
    expect(capabilities.nestedRepeats).toBe(false);
    expect(capabilities.openSteps).toBe(false);
    expect(capabilities.paceTargets).toBe(false);
    expect(capabilities.cadenceTargets).toBe(false);
    expect(capabilities.supportedSports).toEqual(['run', 'indoor_run', 'trail_run', 'bike', 'indoor_bike']);
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
