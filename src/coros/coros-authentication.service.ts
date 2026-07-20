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

  public useSession(accessToken: string, userId: string): void {
    assert(accessToken.trim(), 'Access token must not be empty');
    assert(userId.trim(), 'User id must not be empty');
    this._accessToken = accessToken.trim();
    this._userId = userId.trim();
  }
}
