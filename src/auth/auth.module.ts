import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { AuthBrowserCommandRunner } from './auth-browser.command-runner';
import { INTERACTIVE_AUTH_PROVIDER } from './interactive-auth.provider';
import { PlaywrightAuthService } from './playwright-auth.service';

@Module({
  imports: [HttpModule, SessionModule],
  providers: [
    PlaywrightAuthService,
    AuthBrowserCommandRunner,
    { provide: INTERACTIVE_AUTH_PROVIDER, useExisting: PlaywrightAuthService },
  ],
  exports: [INTERACTIVE_AUTH_PROVIDER, PlaywrightAuthService],
})
export class AuthModule {}
