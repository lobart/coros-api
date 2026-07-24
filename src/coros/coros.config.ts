import 'dotenv/config';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

export const CorosRegion = z.enum(['us', 'eu', 'cn']);
export type CorosRegion = z.infer<typeof CorosRegion>;

const optionalNonEmpty = z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional());
const envBoolean = z.preprocess((value) => value === true || value === 'true' || value === '1', z.boolean());

const CorosConfig = z.object({
  apiUrl: z.url().optional(),
  email: optionalNonEmpty,
  password: optionalNonEmpty,
  defaultRegion: CorosRegion.default('eu'),
  sessionEncryptionKey: optionalNonEmpty,
  sessionStoragePath: z.string().min(1).default('.coros-sessions.enc'),
  protocolFixturePath: z.string().min(1).default('fixtures/protocol'),
  protocolRecorderEnabled: envBoolean.default(false),
  writeApiEnabled: envBoolean.default(false),
  remoteBrowserAuthEnabled: envBoolean.default(false),
  serviceToken: optionalNonEmpty,
});
type CorosConfig = z.infer<typeof CorosConfig>;

const REGION_API_URLS: Record<CorosRegion, string> = {
  us: 'https://teamapi.coros.com',
  eu: 'https://teameuapi.coros.com',
  cn: 'https://teamcnapi.coros.com',
};

@Injectable()
export class CorosConfigService {
  private readonly config: CorosConfig;

  constructor() {
    this.config = CorosConfig.parse({
      apiUrl: process.env.COROS_API_URL,
      email: process.env.COROS_EMAIL,
      password: process.env.COROS_PASSWORD,
      defaultRegion: process.env.COROS_DEFAULT_REGION,
      sessionEncryptionKey: process.env.COROS_SESSION_ENCRYPTION_KEY,
      sessionStoragePath: process.env.COROS_SESSION_STORAGE_PATH,
      protocolFixturePath: process.env.COROS_PROTOCOL_FIXTURE_PATH,
      protocolRecorderEnabled: process.env.COROS_PROTOCOL_RECORDER_ENABLED,
      writeApiEnabled: process.env.COROS_WRITE_API_ENABLED,
      remoteBrowserAuthEnabled: process.env.COROS_REMOTE_BROWSER_AUTH_ENABLED,
      serviceToken: process.env.COROS_SERVICE_TOKEN,
    });
  }

  get apiUrl() {
    return this.config.apiUrl ?? this.apiUrlForRegion(this.config.defaultRegion);
  }

  apiUrlForRegion(region: CorosRegion) {
    return REGION_API_URLS[region];
  }

  get email() {
    if (!this.config.email) throw new Error('COROS_EMAIL is required for the legacy password login command.');
    return this.config.email;
  }

  get password() {
    if (!this.config.password) throw new Error('COROS_PASSWORD is required for the legacy password login command.');
    return this.config.password;
  }

  get defaultRegion() {
    return this.config.defaultRegion;
  }

  get sessionEncryptionKey() {
    return this.config.sessionEncryptionKey;
  }

  get sessionStoragePath() {
    return this.config.sessionStoragePath;
  }

  get protocolFixturePath() {
    return this.config.protocolFixturePath;
  }

  get protocolRecorderEnabled() {
    return this.config.protocolRecorderEnabled;
  }

  get writeApiEnabled() {
    return this.config.writeApiEnabled;
  }

  get remoteBrowserAuthEnabled() {
    return this.config.remoteBrowserAuthEnabled;
  }

  get serviceToken() {
    return this.config.serviceToken;
  }
}
