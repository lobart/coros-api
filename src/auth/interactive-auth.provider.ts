import type { CorosRegion } from '../coros/coros.config';
import type { CorosSession } from '../session/coros-session';

export interface InteractiveAuthProvider {
  authenticate(accountId: string, region: CorosRegion): Promise<CorosSession>;
}

export const INTERACTIVE_AUTH_PROVIDER = Symbol('INTERACTIVE_AUTH_PROVIDER');
