import { describe, expect, it } from 'vitest';
import { NetworkRedactorService } from './network-redactor.service';

describe('NetworkRedactorService', () => {
  const redactor = new NetworkRedactorService();

  it('removes auth, identity and email fields', () => {
    const body = redactor.sanitizeBody({
      accessToken: 'secret-token-value-that-must-never-survive',
      userId: '123',
      nested: { email: 'athlete@example.com', name: 'COROS_API_RESEARCH_test' },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('athlete@example.com');
    expect(serialized).not.toContain('"123"');
    expect(serialized).not.toContain('COROS_API_RESEARCH_test');
    expect(serialized).toContain('<redacted:name>');
  });

  it('keeps only safe request headers', () => {
    expect(
      redactor.sanitizeHeaders({
        authorization: 'Bearer secret',
        cookie: 'secret',
        accesstoken: 'secret',
        'content-type': 'application/json;charset=UTF-8',
      }),
    ).toEqual({ 'content-type': 'application/json' });
  });

  it('redacts sensitive URL parameters', () => {
    const url = redactor.sanitizeUrl('https://teameuapi.coros.com/training/program/add?userId=1&teamId=2');
    expect(url).not.toContain('userId=1');
    expect(url).not.toContain('teamId=2');
  });
});
