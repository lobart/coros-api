import { Injectable } from '@nestjs/common';
import { z } from 'zod';

export const ProtocolScenario = z.enum([
  'run-simple-time',
  'run-warmup-work-cooldown',
  'run-repeat-time-heart-rate',
  'run-repeat-distance-pace',
  'run-open-warmup',
  'run-nested-repeat',
  'bike-time-power',
  'bike-repeat-power',
  'bike-cadence',
  'swim-distance-pace',
  'workout-update',
  'workout-clone',
  'workout-delete',
  'workout-schedule',
  'training-plan-create',
  'training-plan-update',
]);
export type ProtocolScenario = z.infer<typeof ProtocolScenario>;

@Injectable()
export class ScenarioRunnerService {
  instructions(scenario: ProtocolScenario): string[] {
    const name = `COROS_API_RESEARCH_${scenario}_${Date.now()}`;
    return [
      `Создайте только тестовую сущность с названием ${name}.`,
      'Выполните указанный сценарием create/read/update/delete flow вручную в Training Hub.',
      'Не открывайте реальные активности, GPS или health-разделы.',
      'Recorder автоматически заблокирует удаление сущности, которую не создал текущий запуск.',
    ];
  }
}
