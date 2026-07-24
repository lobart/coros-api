import { describe, expect, it } from 'vitest';
import { StructuredWorkoutCreate, workoutDurationSeconds } from './domain/structured-workout';
import { CorosWorkoutMapper } from './mappers/coros-workout.mapper';

const cases = [
  {
    name: 'simple outdoor run without target',
    workout: {
      sport: 'run',
      name: 'Easy run',
      steps: [{ kind: 'work', durationType: 'time', durationValue: 3_600, target: { type: 'none' } }],
    },
    sportType: 1,
    duration: 3_600,
  },
  {
    name: 'indoor run with heart-rate range',
    workout: {
      sport: 'indoor_run',
      name: 'Treadmill aerobic',
      steps: [
        {
          kind: 'work',
          durationType: 'time',
          durationValue: 2_700,
          target: { type: 'heart_rate', min: 137, max: 148 },
        },
      ],
    },
    sportType: 1,
    duration: 2_700,
  },
  {
    name: 'trail run with heart-rate ceiling',
    workout: {
      sport: 'trail_run',
      name: 'Trail endurance',
      steps: [{ kind: 'work', durationType: 'time', durationValue: 4_500, target: { type: 'heart_rate', max: 150 } }],
    },
    sportType: 1,
    duration: 4_500,
  },
  {
    name: 'run warmup work cooldown',
    workout: {
      sport: 'run',
      name: 'Progressive run',
      steps: [
        { kind: 'warmup', durationType: 'time', durationValue: 900, target: { type: 'heart_rate', max: 136 } },
        {
          kind: 'work',
          durationType: 'time',
          durationValue: 1_800,
          target: { type: 'heart_rate', min: 137, max: 148 },
        },
        { kind: 'cooldown', durationType: 'time', durationValue: 600, target: { type: 'heart_rate', max: 136 } },
      ],
    },
    sportType: 1,
    duration: 3_300,
  },
  {
    name: 'run repetitions with heart-rate work and recovery',
    workout: {
      sport: 'run',
      name: '5 x 3 min',
      steps: [
        { kind: 'warmup', durationType: 'time', durationValue: 900, target: { type: 'heart_rate', max: 136 } },
        {
          kind: 'repeat',
          repeatCount: 5,
          steps: [
            {
              kind: 'work',
              durationType: 'time',
              durationValue: 180,
              target: { type: 'heart_rate', min: 160, max: 170 },
            },
            { kind: 'recovery', durationType: 'time', durationValue: 120, target: { type: 'heart_rate', max: 136 } },
          ],
        },
        { kind: 'cooldown', durationType: 'time', durationValue: 600, target: { type: 'heart_rate', max: 136 } },
      ],
    },
    sportType: 1,
    duration: 3_000,
  },
  {
    name: 'recovery run with rest step',
    workout: {
      sport: 'run',
      name: 'Recovery',
      steps: [
        { kind: 'work', durationType: 'time', durationValue: 1_500, target: { type: 'heart_rate', max: 130 } },
        { kind: 'rest', durationType: 'time', durationValue: 300, target: { type: 'none' } },
      ],
    },
    sportType: 1,
    duration: 1_800,
  },
  {
    name: 'simple road bike power range',
    workout: {
      sport: 'bike',
      name: 'Road endurance',
      steps: [
        { kind: 'work', durationType: 'time', durationValue: 5_400, target: { type: 'power', min: 130, max: 150 } },
      ],
    },
    sportType: 200,
    duration: 5_400,
  },
  {
    name: 'simple indoor bike power range',
    workout: {
      sport: 'indoor_bike',
      name: 'Trainer endurance',
      steps: [
        { kind: 'work', durationType: 'time', durationValue: 3_600, target: { type: 'power', min: 130, max: 150 } },
      ],
    },
    sportType: 2,
    duration: 3_600,
  },
  {
    name: 'indoor bike warmup work cooldown',
    workout: {
      sport: 'indoor_bike',
      name: 'Tempo trainer',
      steps: [
        { kind: 'warmup', durationType: 'time', durationValue: 600, target: { type: 'power', min: 90, max: 110 } },
        { kind: 'work', durationType: 'time', durationValue: 1_800, target: { type: 'power', min: 160, max: 175 } },
        { kind: 'cooldown', durationType: 'time', durationValue: 600, target: { type: 'power', min: 85, max: 100 } },
      ],
    },
    sportType: 2,
    duration: 3_000,
  },
  {
    name: 'indoor bike power repetitions',
    workout: {
      sport: 'indoor_bike',
      name: '4 x 5 min',
      steps: [
        {
          kind: 'repeat',
          repeatCount: 4,
          steps: [
            { kind: 'work', durationType: 'time', durationValue: 300, target: { type: 'power', min: 190, max: 205 } },
            {
              kind: 'recovery',
              durationType: 'time',
              durationValue: 180,
              target: { type: 'power', min: 90, max: 110 },
            },
          ],
        },
      ],
    },
    sportType: 2,
    duration: 1_920,
  },
] as const;

describe('confirmed COROS workout matrix', () => {
  const mapper = new CorosWorkoutMapper();

  it.each(cases)('$name', ({ workout, sportType, duration }) => {
    const validated = StructuredWorkoutCreate.parse({
      ...workout,
      expectedDurationSeconds: duration,
    });
    const program = mapper.toProgram(validated);

    expect(workoutDurationSeconds(validated.steps)).toBe(duration);
    expect(program.sportType).toBe(sportType);
    expect(program.duration).toBe(duration);
    expect(program.exercises.length).toBeGreaterThan(0);
  });
});
