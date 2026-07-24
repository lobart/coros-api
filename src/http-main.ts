import { NestFactory } from '@nestjs/core';
import { CorosConfigService } from './coros/coros.config';
import { CorosErrorFilter } from './http/coros-error.filter';
import { HttpAppModule } from './http/http-app.module';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(HttpAppModule, { logger: ['log', 'warn', 'error'] });
  const config = application.get(CorosConfigService);
  if (!config.serviceToken) throw new Error('COROS_SERVICE_TOKEN is required for the HTTP API.');
  application.useGlobalFilters(new CorosErrorFilter());
  await application.listen(Number(process.env.PORT ?? 3010), '127.0.0.1');
}

void bootstrap();
