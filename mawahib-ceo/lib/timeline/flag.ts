/**
 * Timeline Feature Flag.
 *
 * Controlled by NEXT_PUBLIC_TIMELINE_ENABLED env var.
 * When false (default), the /timeline route shows notFound().
 *
 * To enable locally: set NEXT_PUBLIC_TIMELINE_ENABLED=true in .env.local
 * To enable in production: add to Vercel env vars.
 *
 * Rollback: simply unset the env var — route vanishes, zero code deletion needed.
 */
export const TIMELINE_ENABLED =
  process.env.NEXT_PUBLIC_TIMELINE_ENABLED === 'true'
