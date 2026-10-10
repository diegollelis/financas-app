import { z } from 'zod';

/**
 * The site's CSP forbids eval (`public/_headers`). Zod would probe for it (`new Function`) before
 * its first object parse and, though it falls back, the browser reports the probe as a policy
 * violation. Imported first in main.tsx, before env.ts parses anything.
 */
z.config({ jitless: true });
