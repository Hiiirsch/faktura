/**
 * Prüfung des CSRF-Tokenpaares (NFA-SEC-10).
 *
 * Getrennt von `csrf.ts`, weil der zeitkonstante Vergleich `node:crypto`
 * benötigt — und diese Abhängigkeit weder in die Edge-Laufzeit noch in das
 * Browser-Bündel gehört.
 */
import { constantTimeEquals } from '@/infrastructure/auth/tokens';

export function isValidCsrfPair(cookieValue: string | undefined, formValue: unknown): boolean {
  if (typeof cookieValue !== 'string' || cookieValue.length === 0) {
    return false;
  }
  if (typeof formValue !== 'string' || formValue.length === 0) {
    return false;
  }
  return constantTimeEquals(cookieValue, formValue);
}
