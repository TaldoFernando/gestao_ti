import { Controller, Get } from '@nestjs/common';

// Mesmo endpoint em todos os serviços HTTP; usado pelo healthcheck do Docker.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: process.env.SERVICE_NAME ?? 'unknown' };
  }
}
