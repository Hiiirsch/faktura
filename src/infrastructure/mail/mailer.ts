/**
 * Zustellung per E-Mail (M14, NFA-COMP-05 in neuer Fassung, NFA-BETR-12).
 *
 * **Die einzige ausgehende Verbindung der Anwendung.** Bis M13 galt: keine
 * Daten an Dritte, kein Netz nach außen. Der Auftraggeber hat die Zusage
 * verengt statt gestrichen — es gibt genau diesen einen Weg hinaus, und er
 * führt zu einem Server, den der Betreiber selbst benennt.
 *
 * **Ohne Konfiguration ist der Versand aus**, und zwar als Rückgabewert und
 * nicht als Ausnahme. Ein Aufrufer, der nichts einrichtet, verhält sich damit
 * exakt wie vor M14; er muss dafür nichts wissen und nichts abfangen.
 *
 * **Ein Fehlschlag bricht keine Handlung ab.** Wer ein Mitglied einlädt, hat es
 * eingeladen — auch wenn der Mailserver schweigt. Der Link steht ohnehin in der
 * Oberfläche; die Zustellung ist die Zugabe. Deshalb gibt diese Funktion einen
 * Ergebniswert zurück und wirft nicht.
 *
 * **Nur Text, kein HTML.** Eine HTML-Mail lädt Bilder nach, und genau das tut
 * diese Anwendung nirgends (NFA-COMP-06). Ein Link bleibt im Text sichtbar,
 * was er ist — in HTML kann er etwas anderes anzeigen, als er tut.
 */
import { createTransport, type Transporter } from 'nodemailer';

import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';

/**
 * Zeitgrenzen für Verbindung, Begrüßung und Übergabe.
 *
 * Ein hängender Mailserver darf keine Server Action festhalten: Wer ein
 * Mitglied einlädt, wartet sonst auf eine Zugabe, während die Handlung längst
 * getan ist.
 */
const TIMEOUT_MS = 10_000;

export type MailResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not-configured' }
  | { readonly ok: false; readonly reason: 'failed' };

export type Mail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

/**
 * Der Versender wird einmal gebaut und wiederverwendet.
 *
 * `undefined` heißt „noch nicht gefragt", `null` heißt „nicht eingerichtet" —
 * ohne diese Unterscheidung fragte jeder Aufruf ohne Konfiguration die
 * Umgebung erneut, nur um festzustellen, dass es keine gibt.
 */
let transporter: Transporter | null | undefined;

function resolveTransport(): Transporter | null {
  if (transporter !== undefined) {
    return transporter;
  }

  const env = getEnv();
  if (env.SMTP_URL === undefined || env.MAIL_FROM === undefined) {
    transporter = null;
    return null;
  }

  transporter = createTransport(env.SMTP_URL, {
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  return transporter;
}

/** Ob überhaupt zugestellt werden kann — für Oberflächen, die es sagen wollen. */
export function isMailConfigured(): boolean {
  return resolveTransport() !== null;
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const transport = resolveTransport();
  if (transport === null) {
    return { ok: false, reason: 'not-configured' };
  }

  try {
    await transport.sendMail({
      from: getEnv().MAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });

    /*
     * Protokolliert wird **dass** zugestellt wurde, nicht **was**: Der Inhalt
     * trägt einen Nachweis, und ein Nachweis im Log wäre ein zweiter Ort, an
     * dem er steht.
     */
    logger.info('mail.sent', { subject: mail.subject });
    return { ok: true };
  } catch (error) {
    logger.warn('mail.failed', { subject: mail.subject, error });
    return { ok: false, reason: 'failed' };
  }
}

/** Schließt die Verbindung — für den geordneten Abbau in Tests und Skripten. */
export function closeMailer(): void {
  transporter?.close();
  transporter = undefined;
}
