import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const SECRET_KEY = /(authorization|cookie|token|secret|password|passwd|pwd|csrf|email|account|yfheader)/i;
const IDENTITY_KEY = /^(userId|teamId|deviceId|openId|openUserId)$/i;
const PERSONAL_TEXT_KEY = /^(name|title|description|overview|notes?|comment|address)$/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const TOKEN_LIKE = /\b[A-Za-z0-9_-]{28,}\b/;

export type SanitizedNetworkValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

@Injectable()
export class NetworkRedactorService {
  sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    const contentType = headers['content-type'];
    if (contentType) result['content-type'] = contentType.split(';')[0] ?? contentType;
    return result;
  }

  sanitizeUrl(rawUrl: string): string {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_KEY.test(key) || IDENTITY_KEY.test(key)) url.searchParams.set(key, `<redacted:${key}>`);
    }
    return `${url.origin}${url.pathname}${url.search}`;
  }

  sanitizeBody(value: unknown): SanitizedNetworkValue {
    const sanitized = this.walk(value, '');
    const serialized = JSON.stringify(sanitized);
    if (EMAIL.test(serialized) || TOKEN_LIKE.test(serialized)) {
      throw new Error('Network redaction could not prove that the payload is free of secrets.');
    }
    return sanitized;
  }

  schemaHash(value: unknown): string {
    const shape = this.shape(value);
    return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
  }

  private walk(value: unknown, key: string): SanitizedNetworkValue {
    if (SECRET_KEY.test(key)) return `<redacted:${key}>`;
    if (IDENTITY_KEY.test(key)) return `<redacted:${key}>`;
    if (PERSONAL_TEXT_KEY.test(key)) return `<redacted:${key}>`;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (EMAIL.test(value) || TOKEN_LIKE.test(value)) return '<redacted:value>';
      return '<string>';
    }
    if (Array.isArray(value)) return value.map((item) => this.walk(item, key));
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
          entryKey,
          this.walk(entryValue, entryKey),
        ]),
      );
    }
    return String(value);
  }

  private shape(value: unknown): unknown {
    if (Array.isArray(value)) return value.length ? [this.shape(value[0])] : [];
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.shape(item)]),
      );
    }
    return value === null ? 'null' : typeof value;
  }
}
