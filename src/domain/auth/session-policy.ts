/**
 * Lebensdauer und Gültigkeit von Sitzungen (NFA-SEC-07, Spec §11.1).
 */

/** Ablauf nach sieben Tagen (Spec §11.1). */
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Mindestabstand, bevor `lastSeenAt` erneut geschrieben wird. Ohne diese
 * Schwelle erzeugte jeder einzelne Seitenaufruf einen Schreibvorgang.
 */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function computeSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_LIFETIME_MS);
}

export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function shouldTouchSession(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
