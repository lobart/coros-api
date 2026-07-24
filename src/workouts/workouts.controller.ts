import { Body, Controller, Delete, Get, Headers, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ServiceAuthGuard } from '../http/service-auth.guard';
import { CorosWorkoutService } from './coros-workout.service';

@Controller('/api/v1/coros/accounts/:accountId')
@UseGuards(ServiceAuthGuard)
export class WorkoutsController {
  constructor(private readonly workouts: CorosWorkoutService) {}

  @Get('capabilities')
  async capabilities(@Param('accountId') accountId: string) {
    return await this.workouts.capabilitiesFor(accountId);
  }

  @Get('workouts')
  async list(@Param('accountId') accountId: string) {
    return await this.workouts.listWorkouts(accountId);
  }

  @Get('workouts/:workoutId')
  async get(@Param('accountId') accountId: string, @Param('workoutId') workoutId: string) {
    return await this.workouts.getWorkout(accountId, workoutId);
  }

  @Post('workouts')
  async create(
    @Param('accountId') accountId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return await this.workouts.createWorkout(accountId, body, idempotencyKey);
  }

  @Put('workouts/:workoutId')
  async update(@Param('accountId') accountId: string, @Param('workoutId') workoutId: string, @Body() body: unknown) {
    return await this.workouts.updateWorkout(accountId, workoutId, body);
  }

  @Post('workouts/:workoutId/replacements')
  async replace(@Param('accountId') accountId: string, @Param('workoutId') workoutId: string, @Body() body: unknown) {
    return await this.workouts.replaceWorkout(accountId, workoutId, body);
  }

  @Post('workouts/:workoutId/copy')
  async copy(@Param('accountId') accountId: string, @Param('workoutId') workoutId: string) {
    return await this.workouts.copyWorkout(accountId, workoutId);
  }

  @Post('workouts/paste')
  async paste(
    @Param('accountId') accountId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return await this.workouts.pasteWorkout(accountId, body, idempotencyKey);
  }

  @Post('weeks/copy')
  async copyWeek(@Param('accountId') accountId: string, @Body() body: unknown) {
    return await this.workouts.copyWeek(accountId, body);
  }

  @Post('weeks/paste')
  async pasteWeek(@Param('accountId') accountId: string, @Body() body: unknown) {
    return await this.workouts.pasteWeek(accountId, body);
  }

  @Post('workouts/estimate')
  async estimate(@Param('accountId') accountId: string, @Body() body: unknown) {
    return await this.workouts.estimateWorkout(accountId, body);
  }

  @Get('workouts/:workoutId/load')
  async load(@Param('accountId') accountId: string, @Param('workoutId') workoutId: string) {
    return await this.workouts.getWorkoutLoad(accountId, workoutId);
  }

  @Delete('workouts/:workoutId')
  async delete(@Param('accountId') accountId: string, @Param('workoutId') workoutId: string) {
    await this.workouts.deleteWorkout(accountId, workoutId);
    return { status: 'deleted' };
  }

  @Post('workouts/:workoutId/schedule')
  async schedule(@Param('accountId') accountId: string, @Param('workoutId') workoutId: string, @Body() body: unknown) {
    return await this.workouts.scheduleWorkout(accountId, workoutId, body);
  }
}
