import { Injectable } from '@nestjs/common';

@Injectable()
export class ProtocolPlaywrightAuthService {
  loginUrl(): string {
    return 'https://t.coros.com/';
  }
}
