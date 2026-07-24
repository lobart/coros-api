import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { CorosRegion, type CorosRegion as CorosRegionType } from '../coros/coros.config';
import { PlaywrightAuthService } from './playwright-auth.service';

type Flags = { accountId: string; region: CorosRegionType };

@Command({
  name: 'auth-browser',
  description: 'Open a headed COROS Training Hub login without collecting credentials',
})
export class AuthBrowserCommandRunner extends CommandRunner {
  private readonly logger = new Logger(AuthBrowserCommandRunner.name);

  constructor(private readonly auth: PlaywrightAuthService) {
    super();
  }

  async run(_parameters: string[], flags: Flags): Promise<void> {
    await this.auth.authenticate(flags.accountId, flags.region);
    this.logger.log('COROS account connected.');
  }

  @Option({ flags: '--account-id <accountId>', required: true })
  parseAccountId(value: string): string {
    const result = value.trim();
    if (!result) throw new Error('account-id must not be empty');
    return result;
  }

  @Option({ flags: '--region <region>', required: false, defaultValue: 'eu' })
  parseRegion(value: string): CorosRegionType {
    return CorosRegion.parse(value);
  }
}
