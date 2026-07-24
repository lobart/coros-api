import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { CorosRegion, type CorosRegion as CorosRegionType } from '../coros/coros.config';
import { ProtocolRecorderService } from './protocol-recorder.service';
import { ProtocolScenario, type ProtocolScenario as ProtocolScenarioType } from './scenario-runner.service';

type Flags = {
  accountId: string;
  region: CorosRegionType;
  scenario: ProtocolScenarioType;
  confirmWriteResearch: boolean;
};

@Command({ name: 'record-workout-protocol', description: 'Record a sanitized COROS Training Hub scenario' })
export class RecordWorkoutProtocolCommandRunner extends CommandRunner {
  private readonly logger = new Logger(RecordWorkoutProtocolCommandRunner.name);

  constructor(private readonly recorder: ProtocolRecorderService) {
    super();
  }

  async run(_parameters: string[], flags: Flags): Promise<void> {
    const target = await this.recorder.record(
      flags.accountId,
      flags.region,
      flags.scenario,
      flags.confirmWriteResearch,
    );
    this.logger.log(`Sanitized fixture saved: ${target}`);
  }

  @Option({ flags: '--account-id <accountId>', required: true })
  parseAccountId(value: string): string {
    const accountId = value.trim();
    if (!accountId) throw new Error('account-id must not be empty');
    return accountId;
  }

  @Option({ flags: '--region <region>', required: false, defaultValue: 'eu' })
  parseRegion(value: string): CorosRegionType {
    return CorosRegion.parse(value);
  }

  @Option({ flags: '--scenario <scenario>', required: true })
  parseScenario(value: string): ProtocolScenarioType {
    return ProtocolScenario.parse(value);
  }

  @Option({ flags: '--confirm-write-research', required: false, defaultValue: false })
  parseConfirmation(): boolean {
    return true;
  }
}
