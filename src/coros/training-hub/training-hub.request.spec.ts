import type { HttpService } from '@nestjs/axios';
import { describe, expect, it, vi } from 'vitest';
import type { CorosConfigService } from '../coros.config';
import { CorosAuthenticationService } from '../coros-authentication.service';
import { TrainingHubRequest } from './training-hub.request';

function success(data: unknown) {
  return { data: { apiCode: 'test', message: 'OK', result: '0000', data } };
}

function requestWith(responses: unknown[]) {
  const axiosRequest = vi.fn();
  for (const response of responses) axiosRequest.mockResolvedValueOnce(response);
  const authentication = new CorosAuthenticationService();
  authentication.accessToken = 'secret-access-token';
  authentication.userId = 'coach-account-id';
  const request = new TrainingHubRequest(
    { axiosRef: { request: axiosRequest } } as unknown as HttpService,
    { apiUrl: 'https://teameuapi.coros.com' } as CorosConfigService,
    authentication,
  );
  return { request, axiosRequest };
}

describe('TrainingHubRequest', () => {
  it('sends team context and account YFHeader when calculating a program', async () => {
    const { request, axiosRequest } = requestWith([success({ planDuration: 3600 })]);

    await expect(
      request.calculateTrainingProgram({ idInPlan: 133, name: 'Tempo' }, { teamId: 'team-1', userId: 'athlete-1' }),
    ).resolves.toEqual({ planDuration: 3600 });

    expect(axiosRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://teameuapi.coros.com/training/program/calculate?teamId=team-1&userId=athlete-1',
        headers: {
          accessToken: 'secret-access-token',
          YFHeader: JSON.stringify({ userId: 'coach-account-id' }),
        },
        data: { idInPlan: 133, name: 'Tempo' },
      }),
    );
  });

  it('rejects partial team context before sending a request', async () => {
    const { request, axiosRequest } = requestWith([]);

    await expect(request.updateTrainingSchedule({ versionObjects: [] }, { teamId: 'team-1' })).rejects.toThrow(
      'teamId and userId must be supplied together',
    );
    expect(axiosRequest).not.toHaveBeenCalled();
  });

  it('paginates team members without exposing credentials in the payload', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ userId: `user-${index}` }));
    const secondPage = [{ userId: 'user-100' }];
    const { request, axiosRequest } = requestWith([
      success({ teamUserDataList: firstPage, totalRecords: 101 }),
      success({ teamUserDataList: secondPage, totalRecords: 101 }),
    ]);

    const members = await request.listTeamMembers('team-1');

    expect(members).toHaveLength(101);
    expect(axiosRequest).toHaveBeenCalledTimes(2);
    expect(axiosRequest.mock.calls[1]?.[0]?.data).toEqual(
      expect.objectContaining({ teamId: 'team-1', startNo: 100, size: 100 }),
    );
    expect(JSON.stringify(axiosRequest.mock.calls.map(([call]) => call.data))).not.toContain('secret-access-token');
  });

  it('supports estimate and delete-style schedule updates', async () => {
    const { request, axiosRequest } = requestWith([success({ duration: 300, trainingLoad: 14 }), success({})]);

    await request.estimateTrainingProgram({ entity: {}, program: {} });
    await request.updateTrainingSchedule({ versionObjects: [{ id: '133', status: 3 }], pbVersion: 2 });

    expect(axiosRequest.mock.calls[0]?.[0]?.url).toBe('https://teameuapi.coros.com/training/program/estimate');
    expect(axiosRequest.mock.calls[1]?.[0]?.url).toBe('https://teameuapi.coros.com/training/schedule/update');
  });
});
