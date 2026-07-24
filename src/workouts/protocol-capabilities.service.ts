import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CorosConfigService, type CorosRegion } from '../coros/coros.config';
import type { CorosWriteCapabilities } from './domain/coros-write-capabilities';

const Fixture = z.object({
  protocolVersion: z.string(),
  region: z.string(),
  scenario: z.string(),
  verifiedOutcome: z.boolean().optional(),
  captures: z.array(
    z.object({
      method: z.string(),
      url: z.string(),
      responseStatus: z.number().nullable(),
      responseResult: z.string().optional(),
    }),
  ),
});

@Injectable()
export class ProtocolCapabilitiesService {
  constructor(private readonly config: CorosConfigService) {}

  async forRegion(region: CorosRegion): Promise<CorosWriteCapabilities> {
    const fixtures = await this.fixtures(region);
    const expectedHost = new URL(this.config.apiUrlForRegion(region)).hostname;
    const verified = fixtures.filter(
      (fixture) =>
        fixture.verifiedOutcome === true &&
        fixture.region === region &&
        fixture.captures.every((capture) => new URL(capture.url).hostname === expectedHost),
    );
    const has = (scenario: string, path: string) =>
      verified.some(
        (fixture) =>
          fixture.scenario === scenario &&
          fixture.captures.some(
            (capture) =>
              capture.method === 'POST' &&
              new URL(capture.url).pathname === path &&
              capture.responseStatus === 200 &&
              capture.responseResult === '0000',
          ),
      );
    const create =
      has('run-simple-time', '/training/program/calculate') && has('run-simple-time', '/training/program/add');
    const list = has('run-simple-time', '/training/program/query');
    const remove = has('workout-delete', '/training/program/delete');
    const schedule = has('workout-schedule', '/training/schedule/update');
    const bike =
      has('bike-time-power', '/training/program/calculate') && has('bike-time-power', '/training/program/add');
    const swim =
      has('swim-distance-pace', '/training/program/calculate') && has('swim-distance-pace', '/training/program/add');
    return {
      createWorkout: create && list,
      updateWorkout: has('workout-update', '/training/program/add') && list,
      deleteWorkout: remove,
      scheduleWorkout: schedule && list,
      unscheduleWorkout: has('workout-delete', '/training/schedule/update'),
      createTrainingPlan: has('training-plan-create', '/training/plan/add'),
      updateTrainingPlan: has('training-plan-update', '/training/plan/update'),
      repeatBlocks:
        has('run-repeat-time-heart-rate', '/training/program/add') || has('bike-repeat-power', '/training/program/add'),
      nestedRepeats: has('run-nested-repeat', '/training/program/add'),
      openSteps: has('run-open-warmup', '/training/program/add'),
      paceTargets: has('run-repeat-distance-pace', '/training/program/add'),
      heartRateTargets: has('run-repeat-time-heart-rate', '/training/program/add'),
      powerTargets: has('bike-time-power', '/training/program/add'),
      cadenceTargets: has('bike-cadence', '/training/program/add'),
      supportedSports: [
        ...(create ? (['run', 'indoor_run', 'trail_run'] as const) : []),
        ...(bike ? (['bike', 'indoor_bike'] as const) : []),
        ...(swim ? (['pool_swim'] as const) : []),
      ],
      protocolVersion: verified[0]?.protocolVersion ?? 'unconfirmed',
    };
  }

  private async fixtures(region: CorosRegion): Promise<z.infer<typeof Fixture>[]> {
    const directory = resolve(this.config.protocolFixturePath, region);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      return [];
    }
    const result: z.infer<typeof Fixture>[] = [];
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      try {
        result.push(Fixture.parse(JSON.parse(await readFile(resolve(directory, name), 'utf8'))));
      } catch {}
    }
    return result;
  }
}
