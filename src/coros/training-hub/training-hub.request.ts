import { URL } from 'node:url';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CorosConfigService } from '../coros.config';
import { CorosAuthenticationService } from '../coros-authentication.service';

const CorosEnvelope = z.object({
  apiCode: z.string(),
  message: z.string(),
  result: z.string(),
  data: z.unknown(),
});

export const TeamContext = z
  .object({
    teamId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.teamId) === Boolean(value.userId), {
    message: 'teamId and userId must be supplied together',
  });
export type TeamContext = z.infer<typeof TeamContext>;

const Team = z.record(z.string(), z.unknown());
const TeamMember = z.record(z.string(), z.unknown());
const ProgramPayload = z.record(z.string(), z.unknown());
const ScheduleUpdatePayload = z.record(z.string(), z.unknown());

@Injectable()
export class TrainingHubRequest {
  constructor(
    private readonly httpService: HttpService,
    private readonly corosConfig: CorosConfigService,
    private readonly authentication: CorosAuthenticationService,
  ) {}

  async getAccount(): Promise<Record<string, unknown>> {
    return this.dataRecord(await this.request('GET', '/account/query'));
  }

  async listTeams(): Promise<Record<string, unknown>[]> {
    const data = this.dataRecord(await this.request('GET', '/team/user/teamlist'));
    const result = z.array(Team).safeParse(data.teamList);
    return result.success ? result.data : [];
  }

  async listTeamMembers(teamId: string): Promise<Record<string, unknown>[]> {
    const validatedTeamId = z.string().min(1).parse(teamId);
    const members: Record<string, unknown>[] = [];
    const pageSize = 100;
    let startNo = 0;
    for (;;) {
      const data = this.dataRecord(
        await this.request('POST', '/team/user/search', {
          body: {
            teamId: validatedTeamId,
            groupId: '',
            startNo,
            orderByList: [],
            size: pageSize,
            statusList: [100],
          },
        }),
      );
      const parsed = z.array(TeamMember).safeParse(data.teamUserDataList);
      const page = parsed.success ? parsed.data : [];
      members.push(...page);
      startNo += page.length;
      const totalRecords = Number(data.totalRecords);
      if (!page.length || page.length < pageSize || (Number.isFinite(totalRecords) && startNo >= totalRecords)) break;
    }
    return members;
  }

  async estimateTrainingProgram(program: Record<string, unknown>, context: TeamContext = {}) {
    return this.dataRecord(
      await this.request('POST', '/training/program/estimate', {
        context: TeamContext.parse(context),
        body: ProgramPayload.parse(program),
      }),
    );
  }

  async calculateTrainingProgram(program: Record<string, unknown>, context: TeamContext = {}) {
    return this.dataRecord(
      await this.request('POST', '/training/program/calculate', {
        context: TeamContext.parse(context),
        body: ProgramPayload.parse(program),
      }),
    );
  }

  async updateTrainingSchedule(payload: Record<string, unknown>, context: TeamContext = {}) {
    return this.dataRecord(
      await this.request('POST', '/training/schedule/update', {
        context: TeamContext.parse(context),
        body: ScheduleUpdatePayload.parse(payload),
      }),
    );
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: { context?: TeamContext; body?: Record<string, unknown> } = {},
  ): Promise<z.infer<typeof CorosEnvelope>> {
    const url = new URL(path, this.corosConfig.apiUrl);
    if (options.context?.teamId && options.context.userId) {
      url.searchParams.set('teamId', options.context.teamId);
      url.searchParams.set('userId', options.context.userId);
    }
    const headers: Record<string, string> = {
      accessToken: this.authentication.accessToken,
    };
    if (this.authentication.userId) {
      headers.YFHeader = JSON.stringify({ userId: this.authentication.userId });
    }
    const response = await this.httpService.axiosRef.request({
      method,
      url: url.toString(),
      headers,
      data: options.body,
    });
    const envelope = CorosEnvelope.parse(response.data);
    if (envelope.result !== '0000') {
      throw new Error(envelope.message, { cause: { apiCode: envelope.apiCode, result: envelope.result } });
    }
    return envelope;
  }

  private dataRecord(envelope: z.infer<typeof CorosEnvelope>): Record<string, unknown> {
    return z.record(z.string(), z.unknown()).parse(envelope.data);
  }
}
