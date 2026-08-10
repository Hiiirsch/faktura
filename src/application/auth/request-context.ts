/**
 * Angaben zur aufrufenden Anfrage für Sitzungsübersicht und Protokoll.
 */
import { headers } from 'next/headers';

import type { RequestContext } from '@/application/auth/session-service';

/** Länge, ab der der Kennstring des Browsers gekürzt wird. */
const MAX_USER_AGENT_LENGTH = 256;

export async function readRequestContext(): Promise<RequestContext> {
  const headerList = await headers();

  const userAgent = headerList.get('user-agent');
  // Die Anwendung läuft ausschließlich hinter dem eigenen Reverse Proxy
  // (NFA-SEC-19). Nur deshalb ist `X-Forwarded-For` hier vertrauenswürdig —
  // bei direkter Erreichbarkeit könnte der Client den Wert frei setzen.
  const forwardedFor = headerList.get('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() ?? null;

  return {
    userAgent: userAgent === null ? null : userAgent.slice(0, MAX_USER_AGENT_LENGTH),
    ipAddress: ipAddress === null || ipAddress.length === 0 ? null : ipAddress,
  };
}
