import { describe, expect, it } from 'vitest';
import { CorosAuthenticationService } from './coros-authentication.service';

describe('CorosAuthenticationService', () => {
  it('reuses an existing Training Hub session without credentials', () => {
    const authentication = new CorosAuthenticationService();

    authentication.useSession(' browser-token ', ' account-user-id ');

    expect(authentication.accessToken).toBe('browser-token');
    expect(authentication.userId).toBe('account-user-id');
  });

  it('rejects incomplete session data', () => {
    const authentication = new CorosAuthenticationService();

    expect(() => authentication.useSession('', 'account-user-id')).toThrow('Access token must not be empty');
    expect(() => authentication.useSession('browser-token', '')).toThrow('User id must not be empty');
  });
});
