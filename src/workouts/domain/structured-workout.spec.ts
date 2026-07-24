import { describe, expect, it } from 'vitest';
import { StructuredWorkoutCreate, workoutDurationSeconds } from './structured-workout';

describe('StructuredWorkoutCreate', () => {
  it('validates a run with a repeat block and exact duration', () => {
    const workout = StructuredWorkoutCreate.parse({
      sport: 'run',
      name: 'Intervals',
      expectedDurationSeconds: 1_800,
      steps: [
        { kind: 'warmup', durationType: 'time', durationValue: 600, target: { type: 'heart_rate', max: 135 } },
        {
          kind: 'repeat',
          repeatCount: 4,
          steps: [
            {
              kind: 'work',
              durationType: 'time',
              durationValue: 180,
              target: { type: 'heart_rate', min: 160, max: 170 },
            },
            { kind: 'recovery', durationType: 'time', durationValue: 120, target: { type: 'heart_rate', max: 135 } },
          ],
        },
      ],
    });
    expect(workoutDurationSeconds(workout.steps)).toBe(1_800);
  });

  it('rejects cycling pace and invalid target ranges', () => {
    expect(() =>
      StructuredWorkoutCreate.parse({
        sport: 'indoor_bike',
        name: 'Bad',
        steps: [
          {
            kind: 'work',
            durationType: 'time',
            durationValue: 600,
            target: { type: 'pace', min: 300, max: 200 },
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects repeat nesting deeper than two levels', () => {
    const leaf = { kind: 'work', durationType: 'time', durationValue: 60 };
    expect(() =>
      StructuredWorkoutCreate.parse({
        sport: 'run',
        name: 'Too deep',
        steps: [
          {
            kind: 'repeat',
            repeatCount: 2,
            steps: [
              {
                kind: 'repeat',
                repeatCount: 2,
                steps: [{ kind: 'repeat', repeatCount: 2, steps: [leaf] }],
              },
            ],
          },
        ],
      }),
    ).toThrow('depth');
  });
});
