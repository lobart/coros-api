import { describe, expect, it } from 'vitest';
import { CorosWorkoutMapper } from './coros-workout.mapper';

describe('CorosWorkoutMapper', () => {
  const mapper = new CorosWorkoutMapper();

  it('maps a simple time and heart-rate run', () => {
    const program = mapper.toProgram({
      sport: 'run',
      name: 'Easy run',
      steps: [
        {
          kind: 'work',
          durationType: 'time',
          durationValue: 3_600,
          target: { type: 'heart_rate', min: 137, max: 148 },
        },
      ],
    });
    expect(program.sportType).toBe(1);
    expect(program.duration).toBe(3_600);
    expect(program.exercises[0]).toEqual(
      expect.objectContaining({
        targetType: 2,
        targetValue: 3_600,
        intensityType: 2,
        intensityValue: 137,
        intensityValueExtend: 148,
      }),
    );
  });

  it('maps cycling power repeat containers without flattening repetitions', () => {
    const program = mapper.toProgram({
      sport: 'indoor_bike',
      name: 'Bike intervals',
      steps: [
        {
          kind: 'repeat',
          repeatCount: 3,
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
    });
    expect(program.duration).toBe(1_440);
    expect(program.exercises).toHaveLength(3);
    expect(program.exercises[0]).toEqual(expect.objectContaining({ isGroup: true, sets: 3 }));
    expect(program.exercises[1]).toEqual(expect.objectContaining({ groupId: '1', intensityType: 6 }));
  });

  it('fails closed for an unconfirmed distance mapping', () => {
    expect(() =>
      mapper.toProgram({
        sport: 'run',
        name: 'Distance',
        steps: [
          {
            kind: 'work',
            durationType: 'distance',
            durationValue: 1_000,
            target: { type: 'pace', min: 240, max: 250 },
          },
        ],
      }),
    ).toThrow('time-based');
  });
});
