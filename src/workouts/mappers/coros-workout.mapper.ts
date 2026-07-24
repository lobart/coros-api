import { Injectable } from '@nestjs/common';
import { CorosErrorCode, CorosIntegrationError } from '../../core/coros-error';
import type { StructuredWorkoutCreate, WorkoutStep, WorkoutTarget } from '../domain/structured-workout';
import { workoutDurationSeconds } from '../domain/structured-workout';

type CorosExercise = Record<string, unknown>;
export type CorosWorkoutProgram = Record<string, unknown> & { exercises: CorosExercise[] };

const SPORT_TYPE: Record<StructuredWorkoutCreate['sport'], number> = {
  run: 1,
  indoor_run: 1,
  trail_run: 1,
  bike: 200,
  indoor_bike: 2,
  pool_swim: 3,
};

@Injectable()
export class CorosWorkoutMapper {
  toProgram(workout: StructuredWorkoutCreate, idInPlan = 0): CorosWorkoutProgram {
    const sportType = SPORT_TYPE[workout.sport];
    const exercises: CorosExercise[] = [];
    let nextId = 1;
    let topLevel = 0;
    for (const step of workout.steps) {
      topLevel += 1;
      if (step.kind === 'repeat') {
        const groupId = nextId++;
        const iterationDuration = workoutDurationSeconds(step.steps ?? []);
        if (iterationDuration === null) this.unsupported('Repeat groups currently require time-based child steps.');
        exercises.push({
          id: groupId,
          name: 'Group',
          exerciseType: 0,
          sportType,
          intensityType: 0,
          intensityValue: 0,
          intensityValueExtend: 0,
          targetType: 2,
          targetValue: iterationDuration,
          sets: step.repeatCount,
          sortNo: 16_777_216 * topLevel,
          restType: 3,
          restValue: 0,
          groupId: '0',
          isGroup: true,
          originId: '0',
        });
        for (const [index, child] of (step.steps ?? []).entries()) {
          exercises.push(
            this.exercise(child, nextId++, 16_777_216 * topLevel + 65_536 * (index + 1), sportType, String(groupId)),
          );
        }
      } else {
        exercises.push(this.exercise(step, nextId++, 16_777_216 * topLevel, sportType, '0'));
      }
    }
    const duration = workoutDurationSeconds(workout.steps);
    return {
      idInPlan,
      name: workout.name,
      sportType,
      subType: exercises.length === 1 ? 0 : 65_535,
      totalSets: exercises.filter((exercise) => !exercise.isGroup).length,
      sets: 1,
      exerciseNum: exercises.filter((exercise) => !exercise.isGroup).length,
      targetType: '',
      targetValue: '',
      version: 0,
      simple: exercises.length === 1,
      exercises,
      access: 1,
      essence: 0,
      estimatedTime: duration ?? 0,
      duration: duration ?? 0,
      originEssence: 0,
      overview: workout.description ?? '',
      type: 0,
      unit: 0,
      pbVersion: 2,
      sourceId: '',
      sourceUrl: '',
      referExercise: { intensityType: 0, hrType: 0, valueType: 0 },
      poolLengthId: 1,
      poolLength: 2500,
      poolLengthUnit: 2,
    };
  }

  private exercise(step: WorkoutStep, id: number, sortNo: number, sportType: number, groupId: string): CorosExercise {
    if (step.durationType !== 'time') this.unsupported('Only time-based steps have a confirmed COROS mapping.');
    const target = this.target(step.target);
    const exerciseType = { warmup: 1, work: 2, recovery: 4, cooldown: 3, rest: 4, repeat: 0 }[step.kind];
    return {
      access: 0,
      createTimestamp: 0,
      defaultOrder: exerciseType,
      equipment: [1],
      exerciseType,
      groupId,
      hrType: target.hrType,
      id,
      intensityCustom: 0,
      intensityDisplayUnit: target.displayUnit,
      intensityMultiplier: 0,
      intensityPercent: 0,
      intensityPercentExtend: 0,
      intensityType: target.intensityType,
      intensityValue: target.low,
      intensityValueExtend: target.high,
      isDefaultAdd: 1,
      isGroup: false,
      isIntensityPercent: false,
      name: step.name ?? this.defaultName(step.kind, sportType),
      originId: '0',
      overview: '',
      part: [0],
      restType: 3,
      restValue: 0,
      sets: 1,
      sortNo,
      sourceId: '0',
      sourceUrl: '',
      sportType,
      subType: 0,
      targetDisplayUnit: 0,
      targetType: 2,
      targetValue: step.durationValue,
      userId: 0,
      videoUrl: '',
    };
  }

  private target(target?: WorkoutTarget): {
    intensityType: number;
    hrType: number;
    low: number;
    high: number;
    displayUnit: number;
  } {
    if (!target || target.type === 'none') {
      return { intensityType: 5, hrType: 0, low: 0, high: 0, displayUnit: 0 };
    }
    const mapping = {
      heart_rate: { intensityType: 2, hrType: 3, displayUnit: 0 },
      pace: { intensityType: 3, hrType: 0, displayUnit: 0 },
      effort_pace: { intensityType: 3, hrType: 0, displayUnit: 0 },
      power: { intensityType: 6, hrType: 0, displayUnit: 0 },
      cadence: { intensityType: 7, hrType: 0, displayUnit: 0 },
    }[target.type];
    return {
      ...mapping,
      low: target.min ?? target.zone ?? 0,
      high: target.max ?? target.min ?? target.zone ?? 0,
    };
  }

  private defaultName(kind: WorkoutStep['kind'], sportType: number): string {
    if (kind === 'warmup') return 'T1120';
    if (kind === 'cooldown') return 'T1122';
    if (kind === 'recovery' || kind === 'rest') return 'T1123';
    if (sportType === 2 || sportType >= 200) return 'T4000';
    if (sportType === 3) return 'T5000';
    return 'T3001';
  }

  private unsupported(message: string): never {
    throw new CorosIntegrationError(CorosErrorCode.capabilityUnavailable, message);
  }
}
