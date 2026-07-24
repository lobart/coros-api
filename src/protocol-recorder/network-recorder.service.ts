import { Injectable } from '@nestjs/common';
import type { Page, Request, Response, Route } from 'playwright';
import { NetworkRedactorService, type SanitizedNetworkValue } from './network-redactor.service';

export type ProtocolCapture = {
  sequence: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: SanitizedNetworkValue | null;
  responseStatus: number | null;
  responseResult?: string;
  responseBody: SanitizedNetworkValue | null;
  requestSchemaHash: string;
  responseSchemaHash: string | null;
  capturedAt: string;
};

@Injectable()
export class NetworkRecorderService {
  private captures: ProtocolCapture[] = [];
  private createdWorkoutIds = new Set<string>();
  private createdScheduleIds = new Set<string>();
  private sequence = 0;
  private captureError: Error | null = null;
  private pending = new Set<Promise<void>>();

  constructor(private readonly redactor: NetworkRedactorService) {}

  async attach(page: Page, allowWrites: boolean): Promise<void> {
    this.captures = [];
    this.createdWorkoutIds = new Set();
    this.createdScheduleIds = new Set();
    this.sequence = 0;
    this.captureError = null;
    this.pending = new Set();

    await page.route('**/*', async (route) => {
      await this.guardWrite(route, allowWrites);
    });
    page.on('response', (response) => {
      const operation = this.capture(response)
        .catch((error: unknown) => {
          this.captureError = error instanceof Error ? error : new Error('Unknown recorder sanitization error.');
        })
        .finally(() => {
          this.pending.delete(operation);
        });
      this.pending.add(operation);
    });
  }

  async results(): Promise<ProtocolCapture[]> {
    await Promise.all(this.pending);
    if (this.captureError) {
      throw new Error(`Fixture was not saved because sanitization failed: ${this.captureError.message}`);
    }
    return structuredClone(this.captures);
  }

  private async guardWrite(route: Route, allowWrites: boolean): Promise<void> {
    const request = route.request();
    if (!this.isTrainingRequest(request) || request.method() === 'GET') {
      await route.continue();
      return;
    }
    if (!allowWrites) {
      await route.abort('blockedbyclient');
      return;
    }
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON() as unknown;
    if (path.endsWith('/training/program/delete')) {
      const ids = Array.isArray(body) ? body.map(String) : [];
      if (!ids.length || ids.some((id) => !this.createdWorkoutIds.has(id))) {
        await route.abort('blockedbyclient');
        return;
      }
    }
    if (path.endsWith('/training/schedule/update') && this.isDeleteScheduleBody(body)) {
      const ids = this.scheduleIds(body);
      if (!ids.length || ids.some((id) => !this.createdScheduleIds.has(id))) {
        await route.abort('blockedbyclient');
        return;
      }
    }
    await route.continue();
  }

  private async capture(response: Response): Promise<void> {
    const request = response.request();
    if (!this.isTrainingRequest(request)) return;
    let requestBody: unknown = null;
    let responseBody: unknown = null;
    try {
      requestBody = request.postDataJSON();
    } catch {
      requestBody = request.postData();
    }
    try {
      const contentType = response.headers()['content-type'] ?? '';
      responseBody = contentType.includes('json') ? await response.json() : null;
    } catch {
      responseBody = null;
    }
    this.rememberCreated(request, requestBody, responseBody, response.status());
    const sanitizedRequest = requestBody === null ? null : this.redactor.sanitizeBody(requestBody);
    const sanitizedResponse = responseBody === null ? null : this.redactor.sanitizeBody(responseBody);
    this.captures.push({
      sequence: ++this.sequence,
      method: request.method(),
      url: this.redactor.sanitizeUrl(request.url()),
      requestHeaders: this.redactor.sanitizeHeaders(await request.allHeaders()),
      requestBody: sanitizedRequest,
      responseStatus: response.status(),
      responseResult: this.responseResult(responseBody),
      responseBody: sanitizedResponse,
      requestSchemaHash: this.redactor.schemaHash(sanitizedRequest),
      responseSchemaHash: sanitizedResponse === null ? null : this.redactor.schemaHash(sanitizedResponse),
      capturedAt: new Date().toISOString(),
    });
  }

  private rememberCreated(request: Request, requestBody: unknown, responseBody: unknown, responseStatus: number): void {
    if (responseStatus !== 200 || !this.isProviderSuccess(responseBody) || !this.hasResearchName(requestBody)) return;
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/training/program/add')) {
      const id = this.responseDataId(responseBody);
      if (id) this.createdWorkoutIds.add(id);
    }
    if (path.endsWith('/training/schedule/update') && !this.isDeleteScheduleBody(requestBody)) {
      for (const id of this.scheduleIds(requestBody)) this.createdScheduleIds.add(id);
    }
  }

  private isProviderSuccess(body: unknown): boolean {
    return Boolean(body && typeof body === 'object' && (body as Record<string, unknown>).result === '0000');
  }

  private hasResearchName(value: unknown): boolean {
    const pending: unknown[] = [value];
    while (pending.length) {
      const item = pending.pop();
      if (typeof item === 'string' && item.startsWith('COROS_API_RESEARCH_')) return true;
      if (Array.isArray(item)) pending.push(...item);
      else if (item && typeof item === 'object') pending.push(...Object.values(item as Record<string, unknown>));
    }
    return false;
  }

  private isTrainingRequest(request: Request): boolean {
    if (!['xhr', 'fetch'].includes(request.resourceType())) return false;
    const url = new URL(request.url());
    return url.hostname.endsWith('coros.com') && url.pathname.startsWith('/training/');
  }

  private isDeleteScheduleBody(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    const versions = (body as Record<string, unknown>).versionObjects;
    return (
      Array.isArray(versions) &&
      versions.some((item) => {
        return Boolean(item && typeof item === 'object' && Number((item as Record<string, unknown>).status) === 3);
      })
    );
  }

  private scheduleIds(body: unknown): string[] {
    if (!body || typeof body !== 'object') return [];
    const versions = (body as Record<string, unknown>).versionObjects;
    if (!Array.isArray(versions)) return [];
    return versions
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => String(item.id ?? ''))
      .filter(Boolean);
  }

  private responseDataId(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const data = (body as Record<string, unknown>).data;
    if (typeof data === 'string' || typeof data === 'number') return String(data);
    if (data && typeof data === 'object') {
      const id = (data as Record<string, unknown>).id;
      if (typeof id === 'string' || typeof id === 'number') return String(id);
    }
    return null;
  }

  private responseResult(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const result = (body as Record<string, unknown>).result;
    return typeof result === 'string' && /^[A-Z0-9_-]{1,20}$/.test(result) ? result : undefined;
  }
}
