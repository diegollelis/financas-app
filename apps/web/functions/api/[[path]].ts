// Cloudflare Pages routes every /api/* request here (ADR 0033). The logic and its tests live in
// edge/, because Pages would turn any file in functions/, a test included, into a route.
export { forwardToApi as onRequest } from '../../edge/forward-to-api';
