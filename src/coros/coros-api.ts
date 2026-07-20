import { Injectable } from '@nestjs/common';
import { LoginRequest } from './account/login.request';
import { DownloadActivityDetailRequest } from './activity/download-activity-detail.request';
import { QueryActivitiesRequest } from './activity/query-activities.request';
import { CorosAuthenticationService } from './coros-authentication.service';
import { type TeamContext, TrainingHubRequest } from './training-hub/training-hub.request';
import { QueryTrainingScheduleRequest } from './training-schedule/query-training-schedule.request';

@Injectable()
export class CorosAPI {
  private readonly loginCommand: LoginRequest;
  private readonly queryActivitiesCommand: QueryActivitiesRequest;
  private readonly downloadActivityDetailCommand: DownloadActivityDetailRequest;
  private readonly queryTrainingScheduleCommand: QueryTrainingScheduleRequest;
  private readonly trainingHubRequest: TrainingHubRequest;

  constructor(
    loginCommand: LoginRequest,
    queryActivitiesCommand: QueryActivitiesRequest,
    downloadActivityDetailCommand: DownloadActivityDetailRequest,
    queryTrainingScheduleCommand: QueryTrainingScheduleRequest,
    trainingHubRequest: TrainingHubRequest,
    private readonly authentication: CorosAuthenticationService,
  ) {
    this.downloadActivityDetailCommand = downloadActivityDetailCommand;
    this.queryActivitiesCommand = queryActivitiesCommand;
    this.loginCommand = loginCommand;
    this.queryTrainingScheduleCommand = queryTrainingScheduleCommand;
    this.trainingHubRequest = trainingHubRequest;
  }

  async login() {
    return await this.loginCommand.run({});
  }

  async useSession(accessToken: string, userId: string) {
    this.authentication.useSession(accessToken, userId);
    return await this.trainingHubRequest.getAccount();
  }

  async queryActivities({
    from,
    to,
    page,
    size,
    sportTypes,
  }: {
    from?: Date;
    to?: Date;
    size?: number;
    page?: number;
    sportTypes: string[];
  }) {
    return await this.queryActivitiesCommand.run({
      from,
      to,
      pageSize: size,
      pageNumber: page,
      modeList: sportTypes.join(','),
    });
  }

  async downloadActivityDetail({
    sportType,
    fileType,
    labelId,
  }: {
    sportType: number;
    fileType: string;
    labelId: string;
  }) {
    return await this.downloadActivityDetailCommand.run({ sportType, fileType, labelId });
  }

  async queryTrainingSchedule({
    startDate,
    endDate,
    supportRestExercise = 1,
    teamId,
    userId,
  }: {
    startDate: Date;
    endDate: Date;
    supportRestExercise?: number;
    teamId?: string;
    userId?: string;
  }) {
    return await this.queryTrainingScheduleCommand.run({
      startDate,
      endDate,
      supportRestExercise,
      teamId,
      userId,
    });
  }

  async getAccount() {
    return await this.trainingHubRequest.getAccount();
  }

  async listTeams() {
    return await this.trainingHubRequest.listTeams();
  }

  async listTeamMembers(teamId: string) {
    return await this.trainingHubRequest.listTeamMembers(teamId);
  }

  async estimateTrainingProgram(program: Record<string, unknown>, context: TeamContext = {}) {
    return await this.trainingHubRequest.estimateTrainingProgram(program, context);
  }

  async calculateTrainingProgram(program: Record<string, unknown>, context: TeamContext = {}) {
    return await this.trainingHubRequest.calculateTrainingProgram(program, context);
  }

  async updateTrainingSchedule(payload: Record<string, unknown>, context: TeamContext = {}) {
    return await this.trainingHubRequest.updateTrainingSchedule(payload, context);
  }
}
