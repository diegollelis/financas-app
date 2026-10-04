import { describe, expect, it } from 'vitest';
import { errorReportingRootOptions } from './error-reporting';

describe('errorReportingRootOptions', () => {
  it('keeps React defaults when the build has no Sentry DSN (development, tests)', () => {
    expect(errorReportingRootOptions()).toEqual({});
  });
});
