import { describe, expect, it } from 'vitest';
import { QueryTrainingScheduleResponse } from './query-training-schedule.request';

describe('QueryTrainingScheduleResponse', () => {
  it('accepts a live response without entities and supplies an empty array', () => {
    const response = QueryTrainingScheduleResponse.parse({
      apiCode: 'fixture',
      message: 'OK',
      result: '0000',
      data: {
        programs: [],
      },
    });

    expect(response.data).toEqual({
      entities: [],
      programs: [],
    });
  });
});
