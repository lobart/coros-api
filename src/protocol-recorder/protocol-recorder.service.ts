import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';
import { CorosConfigService, type CorosRegion } from '../coros/coros.config';
import { NetworkRecorderService } from './network-recorder.service';
import { ProtocolPlaywrightAuthService } from './playwright-auth.service';
import { type ProtocolScenario, ScenarioRunnerService } from './scenario-runner.service';
import { SchemaInferenceService } from './schema-inference.service';

@Injectable()
export class ProtocolRecorderService {
  private readonly logger = new Logger(ProtocolRecorderService.name);

  constructor(
    private readonly config: CorosConfigService,
    private readonly network: NetworkRecorderService,
    private readonly auth: ProtocolPlaywrightAuthService,
    private readonly scenarios: ScenarioRunnerService,
    private readonly schemas: SchemaInferenceService,
  ) {}

  async record(
    accountId: string,
    region: CorosRegion,
    scenario: ProtocolScenario,
    confirmWriteResearch: boolean,
  ): Promise<string> {
    if (!this.config.protocolRecorderEnabled) {
      throw new CorosIntegrationError(CorosErrorCode.capabilityUnavailable, 'COROS_PROTOCOL_RECORDER_ENABLED=false.');
    }
    if (!confirmWriteResearch) {
      throw new CorosIntegrationError(CorosErrorCode.writeDisabled, 'Write research требует --confirm-write-research.');
    }
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ recordHar: undefined, recordVideo: undefined });
    const page = await context.newPage();
    await this.network.attach(page, true);
    try {
      for (const instruction of this.scenarios.instructions(scenario)) this.logger.log(instruction);
      await page.goto(this.auth.loginUrl(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
      this.logger.log('После завершения сценария закройте вкладку COROS.');
      await page.waitForEvent('close', { timeout: 30 * 60_000 });
    } finally {
      await context.close();
      await browser.close();
    }
    const captures = await this.network.results();
    if (!captures.length) {
      throw new CorosIntegrationError(CorosErrorCode.protocolChanged, 'Не зафиксировано ни одного training-запроса.');
    }
    const observedAt = new Date().toISOString();
    const fixture = {
      fixtureId: createHash('sha256')
        .update(`${scenario}:${observedAt}:${this.schemas.fingerprint(captures)}`)
        .digest('hex')
        .slice(0, 16),
      protocolVersion: 'training-hub-web-v1',
      observedAt,
      region,
      accountAliasHash: createHash('sha256').update(accountId).digest('hex'),
      scenario,
      schemaFingerprint: this.schemas.fingerprint(captures),
      captures,
    };
    const directory = resolve(this.config.protocolFixturePath, region);
    await mkdir(directory, { recursive: true });
    const target = resolve(directory, `${scenario}.${fixture.fixtureId}.json`);
    await writeFile(target, `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600 });
    return target;
  }
}
