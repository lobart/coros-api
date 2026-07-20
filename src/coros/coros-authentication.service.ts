import assert from 'node:assert';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CorosAuthenticationService {
  private _accessToken?: string;
  private _userId?: string;

  public get accessToken(): string {
    assert(this._accessToken, 'Access token missing, did you forget to login?');
    return this._accessToken;
  }

  public set accessToken(value: string) {
    this._accessToken = value;
  }

  public get userId(): string | undefined {
    return this._userId;
  }

  public set userId(value: string | undefined) {
    this._userId = value;
  }
}
