import { healthResponseSchema, type HealthResponse } from '@financas/shared';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Always 200 while the process is alive, so the host does not restart the API because of a
   * database hiccup. The body tells whether the database is reachable.
   */
  @Get()
  @ApiOkResponse({
    description: 'The API is up; `database` tells whether the database is reachable.',
    // The OpenAPI schema is generated from the shared Zod schema: no DTO duplicated by hand.
    schema: z.toJSONSchema(healthResponseSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
