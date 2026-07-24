import { z } from 'zod';
import { CorosRegion } from '../coros/coros.config';

export const CorosSession = z.object({
  accountId: z.string().min(1).max(200),
  region: CorosRegion,
  accountUserId: z.string().min(1),
  accessToken: z.string().min(1),
  createdAt: z.iso.datetime(),
  validatedAt: z.iso.datetime(),
  protocolVersion: z.string().min(1).default('training-hub-web-v1'),
});
export type CorosSession = z.infer<typeof CorosSession>;

export const CorosSessionMetadata = CorosSession.omit({ accessToken: true });
export type CorosSessionMetadata = z.infer<typeof CorosSessionMetadata>;

export interface CorosSessionStore {
  save(accountId: string, session: CorosSession): Promise<void>;
  load(accountId: string): Promise<CorosSession | null>;
  delete(accountId: string): Promise<void>;
  list(): Promise<CorosSessionMetadata[]>;
}

export const COROS_SESSION_STORE = Symbol('COROS_SESSION_STORE');
