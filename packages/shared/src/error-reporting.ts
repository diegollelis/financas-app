import { INVITATION_PATH } from './invitation.ts';

/**
 * Path segments that carry a secret token (invitation links and Better Auth's password reset
 * callback). The segment is replaced, so the error report still shows which route it was.
 */
const TOKEN_SEGMENTS = [
  new RegExp(`(${INVITATION_PATH}/)[^/?#]+`, 'g'),
  /(\/api\/invitations\/)[^/?#]+/g,
  /(\/api\/auth\/reset-password\/)[^/?#]+/g,
];

/**
 * A URL that can go into an error report (ADRs 0012 and 0034): no query string or fragment (the
 * password reset and e-mail verification tokens travel as `?token=`) and no token in the path.
 */
export function redactUrl(url: string): string {
  const [path = ''] = url.split(/[?#]/);
  return TOKEN_SEGMENTS.reduce((redacted, segment) => redacted.replace(segment, '$1[token]'), path);
}

/** The parts of a Sentry event that may carry personal data, described without depending on it. */
export interface ReportedBreadcrumb {
  data?: Record<string, unknown>;
}

export interface ReportedEvent {
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: unknown;
    query_string?: unknown;
    env?: unknown;
  };
  user?: unknown;
  breadcrumbs?: ReportedBreadcrumb[];
}

/** Breadcrumb fields that hold URLs: fetch/http requests (`url`) and navigations (`from`, `to`). */
const URL_KEYS = ['url', 'from', 'to'];

export function scrubBreadcrumb<B extends ReportedBreadcrumb>(breadcrumb: B): B {
  for (const key of URL_KEYS) {
    const value = breadcrumb.data?.[key];
    if (typeof value === 'string') breadcrumb.data![key] = redactUrl(value);
  }
  return breadcrumb;
}

/**
 * Last barrier before an event leaves for Sentry (beforeSend), on top of the SDK's own
 * `dataCollection` switches: keeps only the request's redacted URL, drops the user and redacts
 * the URLs in breadcrumbs. Bodies, cookies and headers never leave the app.
 */
export function scrubReportedEvent<E extends ReportedEvent>(event: E): E {
  const request = event.request;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.headers;
    delete request.query_string;
    delete request.env;
    if (request.url) request.url = redactUrl(request.url);
  }
  delete event.user;
  event.breadcrumbs?.forEach(scrubBreadcrumb);
  return event;
}
