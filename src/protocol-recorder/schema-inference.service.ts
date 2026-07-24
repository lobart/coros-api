import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ProtocolCapture } from './network-recorder.service';

@Injectable()
export class SchemaInferenceService {
  fingerprint(captures: ProtocolCapture[]): string {
    const schemas = captures.map(({ method, url, requestSchemaHash, responseSchemaHash }) => ({
      method,
      path: new URL(url).pathname,
      requestSchemaHash,
      responseSchemaHash,
    }));
    return createHash('sha256').update(JSON.stringify(schemas)).digest('hex');
  }
}
