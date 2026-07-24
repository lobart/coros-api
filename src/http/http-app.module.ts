import { Module } from '@nestjs/common';
import { AuthController } from '../auth/auth.controller';
import { CorosConfigService } from '../coros/coros.config';
import { SessionModule } from '../session/session.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { ServiceAuthGuard } from './service-auth.guard';

@Module({
  imports: [SessionModule, WorkoutsModule],
  controllers: [AuthController],
  providers: [CorosConfigService, ServiceAuthGuard],
})
export class HttpAppModule {}
