import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ExportActivitiesCommandRunner } from './command-runner/export-activities.command-runner';
import { ExportTrainingScheduleCommandRunner } from './command-runner/export-training-schedule.command-runner';
import { DownloadFile } from './core/download-file.service';
import { CorosModule } from './coros/coros.module';
import { ProtocolRecorderModule } from './protocol-recorder/protocol-recorder.module';

@Module({
  imports: [CorosModule, HttpModule, AuthModule, ProtocolRecorderModule],
  providers: [ExportActivitiesCommandRunner, ExportTrainingScheduleCommandRunner, DownloadFile],
})
export class AppModule {}
