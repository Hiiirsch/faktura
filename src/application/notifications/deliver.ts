/**
 * Nachweise zustellen (M14, B2 — NFA-BETR-12).
 *
 * **Die Mail ist ein zusätzlicher Weg, kein Ersatz.** Der Link erscheint
 * weiterhin genau einmal in der Oberfläche, wie seit M8; hier kommt nur die
 * Zustellung dazu. Das ist der Kern dieses Bausteins, und er hält die Zusage
 * aus M8 aufrecht: Wer die Mail nicht bekommt, ist nicht ausgesperrt.
 *
 * **Warum in der Anwendungsschicht und nicht in den Server Actions.** Die
 * absolute Adresse entsteht seit M8 in `app/settings/members/actions.ts` — dort
 * hätte auch der Versand stehen können, an drei Stellen. Der vierte Aufrufer
 * hätte ihn vergessen. „Einladen" heißt seit M14: einen Nachweis ausstellen
 * **und** ihn zustellen, wenn ein Weg dafür eingerichtet ist; das ist ein
 * Stück des Anwendungsfalls, kein Beiwerk der Oberfläche.
 *
 * **Die Zustellung wird berichtet, nicht verschwiegen.** Jede Funktion gibt
 * zurück, was aus ihr geworden ist; die Oberfläche sagt es. „Kein Mailserver
 * eingerichtet" ist etwas anderes als „der Mailserver hat abgelehnt", und wer
 * einen Link weiterreichen muss, soll den Unterschied kennen.
 */
import {
  ADMIN_SETUP_MAIL,
  fillMailText,
  INVITATION_MAIL,
  PASSWORD_RESET_MAIL,
} from '@/domain/notifications/mail-texts';
import { getEnv } from '@/infrastructure/config/env';
import { sendMail } from '@/infrastructure/mail/mailer';
import { adminSetupPath, invitationPath, passwordResetPath } from '@/routes';

/**
 * Was aus der Zustellung geworden ist.
 *
 * - `sent` — angenommen vom Mailserver.
 * - `not-configured` — es gibt keinen; der Link steht in der Oberfläche.
 * - `failed` — es gibt einen, er hat abgelehnt oder geschwiegen.
 */
export type Delivery = 'sent' | 'not-configured' | 'failed';

/**
 * Die absolute Adresse aus `APP_URL`, nicht aus der Anfrage.
 *
 * Ein Link, der aus einem `Host`-Kopf entsteht, führt dorthin, wohin der
 * Absender der Anfrage zeigen wollte — dieselbe Überlegung wie seit M8 in den
 * Server Actions, von wo diese Funktion stammt.
 */
function absolute(pathname: string): string {
  return `${getEnv().APP_URL.replace(/\/$/u, '')}${pathname}`;
}

/** Kalendertag und Uhrzeit für den Fließtext einer Mail. */
function until(expiresAt: Date): string {
  return expiresAt.toLocaleString('de-DE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: getEnv().APP_TIMEZONE,
  });
}

async function deliver(to: string, subject: string, text: string): Promise<Delivery> {
  const result = await sendMail({ to, subject, text });
  if (result.ok) {
    return 'sent';
  }
  return result.reason === 'not-configured' ? 'not-configured' : 'failed';
}

export async function deliverInvitation(
  email: string,
  token: string,
  expiresAt: Date,
): Promise<Delivery> {
  const mail = fillMailText(INVITATION_MAIL, {
    link: absolute(invitationPath(token)),
    until: until(expiresAt),
  });

  return deliver(email, mail.subject, mail.text);
}

export async function deliverPasswordReset(
  email: string,
  token: string,
  expiresAt: Date,
): Promise<Delivery> {
  const mail = fillMailText(PASSWORD_RESET_MAIL, {
    link: absolute(passwordResetPath(token)),
    until: until(expiresAt),
  });

  return deliver(email, mail.subject, mail.text);
}

export async function deliverAdminSetup(
  email: string,
  token: string,
  expiresAt: Date,
): Promise<Delivery> {
  const mail = fillMailText(ADMIN_SETUP_MAIL, {
    link: absolute(adminSetupPath(token)),
    until: until(expiresAt),
  });

  return deliver(email, mail.subject, mail.text);
}
