import type { z } from 'zod';
import { ValidationError } from '../core/validation-error';
import { CorosResponseBase, type CorosResponseWithData } from './common';

export abstract class BaseRequest<Input, Response extends CorosResponseWithData, Output = Response['data']> {
  protected abstract inputValidator(): z.Schema<Input>;
  protected abstract responseValidator(): z.Schema<Response>;
  protected abstract handle(args: Input): Promise<Output>;

  public async run(args: Input): Promise<Output> {
    const parseResult = this.inputValidator().safeParse(args);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error);
    }
    return await this.handle(parseResult.data);
  }

  protected assertCorosResponseBase(data: unknown): asserts data is CorosResponseBase {
    const parseResult = CorosResponseBase.safeParse(data);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error, {
        cause: this.responseShape(data),
      });
    }

    const { message, result, apiCode } = parseResult.data;
    if (result !== '0000') {
      throw new Error(message, { cause: { apiCode, result } });
    }
  }

  protected assertCorosResponse(data: unknown): asserts data is Response {
    const parseResult = this.responseValidator().safeParse(data);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error, {
        cause: this.responseShape(data),
      });
    }
  }

  private responseShape(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { responseType: data === null ? 'null' : typeof data };
    }
    const envelope = data as Record<string, unknown>;
    const payload = envelope.data;
    return {
      envelopeKeys: Object.keys(envelope).sort(),
      dataType: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
      dataKeys:
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? Object.keys(payload as Record<string, unknown>)
              .map((key) =>
                /(authorization|cookie|token|secret|password|pwd|csrf|email|yfheader)/i.test(key) ? '<redacted>' : key,
              )
              .sort()
          : undefined,
    };
  }
}
