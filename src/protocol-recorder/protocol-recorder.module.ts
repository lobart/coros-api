import { Module } from '@nestjs/common';
import { CorosConfigService } from '../coros/coros.config';
import { NetworkRecorderService } from './network-recorder.service';
import { NetworkRedactorService } from './network-redactor.service';
import { ProtocolPlaywrightAuthService } from './playwright-auth.service';
import { ProtocolRecorderService } from './protocol-recorder.service';
import { RecordWorkoutProtocolCommandRunner } from './record-workout-protocol.command-runner';
import { ScenarioRunnerService } from './scenario-runner.service';
import { SchemaInferenceService } from './schema-inference.service';

@Module({
  providers: [
    CorosConfigService,
    NetworkRedactorService,
    NetworkRecorderService,
    ProtocolPlaywrightAuthService,
    ScenarioRunnerService,
    SchemaInferenceService,
    ProtocolRecorderService,
    RecordWorkoutProtocolCommandRunner,
  ],
  exports: [ProtocolRecorderService, NetworkRedactorService],
})
export class ProtocolRecorderModule {}
