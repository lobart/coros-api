import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CorosConfigService } from '../coros/coros.config';
import { SessionModule } from '../session/session.module';
import { CorosWorkoutClient } from './coros-workout.client';
import { CorosWorkoutService } from './coros-workout.service';
import { CorosWorkoutMapper } from './mappers/coros-workout.mapper';
import { ProtocolCapabilitiesService } from './protocol-capabilities.service';
import { WorkoutAuditService } from './workout-audit.service';
import { WorkoutMappingStore } from './workout-mapping.store';
import { WorkoutsController } from './workouts.controller';

@Module({
  imports: [HttpModule, SessionModule],
  controllers: [WorkoutsController],
  providers: [
    CorosConfigService,
    CorosWorkoutClient,
    CorosWorkoutMapper,
    ProtocolCapabilitiesService,
    WorkoutMappingStore,
    WorkoutAuditService,
    CorosWorkoutService,
  ],
  exports: [CorosWorkoutService],
})
export class WorkoutsModule {}
