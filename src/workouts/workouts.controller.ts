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
