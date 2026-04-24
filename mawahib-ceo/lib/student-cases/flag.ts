/**
 * Student Cases Feature Flag.
 *
 * Controlled by NEXT_PUBLIC_STUDENT_CASES_ENABLED env var.
 * When false (default), /student-cases routes and sidebar link are hidden.
 *
 * To enable locally:  set NEXT_PUBLIC_STUDENT_CASES_ENABLED=true in .env.local
 * To enable in prod:  add the env var to Vercel then redeploy.
 *
 * Rollback: unset the env var — routes vanish, zero code deletion.
 */
export const STUDENT_CASES_ENABLED =
  process.env.NEXT_PUBLIC_STUDENT_CASES_ENABLED === 'true'
