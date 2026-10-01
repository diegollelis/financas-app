import { healthResponseSchema, type HealthResponse } from '@financas/shared';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({
    description: 'The API is up.',
    // The OpenAPI schema is generated from the shared Zod schema: no DTO duplicated by hand.
    schema: z.toJSONSchema(healthResponseSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
