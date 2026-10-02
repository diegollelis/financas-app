import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';

/**
 * Validates every parameter declared with a schema (`@Body({ schema })`, ADR 0006). Errors use the
 * same shape as our Better Auth validation: `code: INVALID_INPUT` and the first message, which
 * comes from the shared schema in pt-BR, so the web app can show it as it is.
 */
export function createValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new BadRequestException({
        code: 'INVALID_INPUT',
        message: issues[0]?.message ?? 'Dados inválidos.',
        issues: issues.map((issue) => ({
          path: issue.path?.map((segment) =>
            String(typeof segment === 'object' ? segment.key : segment),
          ),
          message: issue.message,
        })),
      }),
  });
}
