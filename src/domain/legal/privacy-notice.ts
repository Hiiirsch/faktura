/**
 * Was die Software speichert — als Daten, nicht als Fließtext
 * (M13, NFA-COMP-08).
 *
 * **Warum das hier steht und nicht als Absatz in `de.ts`.** Eine
 * Datenschutzerklärung nennt Fristen, und die Fristen stehen als Konstanten in
 * `src/domain/auth/**`. Schriebe man sie ein zweites Mal als Zahl in einen
 * Text, gäbe es zwei Wahrheiten — und die zweite wäre die, die nach einer
 * Änderung nicht mehr stimmt. Eine Datenschutzerklärung, die neben der
 * Wirklichkeit herläuft, ist schlimmer als keine: Sie ist eine Zusage, die
 * niemand hält.
 *
 * Deshalb dieselbe Bauart wie `TEMPLATE_VARIABLES` in
 * `domain/rendering/template-variables.ts`: die Auskunft als Liste, die Frist
 * als **Verweis auf die Konstante**, und ein Test, der beides gegeneinander
 * hält.
 *
 * Diese Datei beschreibt ausschließlich die **Software**. Was der Betreiber
 * über sich selbst sagt, kommt aus `PlatformSettings` und steht daneben.
 */
import { INVITATION_TTL_MS } from '../auth/invitation-policy';
import { LOCKOUT_DURATION_MS, MAX_FAILED_LOGINS } from '../auth/lockout-policy';
import { PASSWORD_RESET_TTL_MS } from '../auth/password-reset-policy';
import { PENDING_LOGIN_TTL_MS } from '../auth/pending-login-policy';
import { SESSION_LIFETIME_MS } from '../auth/session-policy';
import { TRUSTED_DEVICE_TTL_MS } from '../auth/trusted-device-policy';

/** Ein gespeicherter Gegenstand samt Zweck und Aufbewahrung. */
export type StoredDatum = {
  /** Was gespeichert wird. */
  readonly subject: string;
  /** Wozu — der Zweck nach Art. 13 Abs. 1 lit. c. */
  readonly purpose: string;
  /**
   * Wie lange, in Millisekunden. `null` heißt: solange das Konto besteht
   * beziehungsweise für die Dauer der gesetzlichen Aufbewahrung.
   */
  readonly retentionMs: number | null;
  /** Der Satz für die Aufbewahrung, wo eine Zahl sie nicht trifft. */
  readonly retentionNote?: string;
};

/**
 * Die zehnjährige Aufbewahrung von Belegen (§147 AO).
 *
 * Als Kommentar und nicht als Konstante: Sie wird nirgends im Code
 * durchgesetzt — Belege werden gar nicht gelöscht (NFA-COMP-04). Eine
 * Konstante, die nichts steuert, wäre eine Behauptung über Code, den es nicht
 * gibt.
 */
export const INVOICE_RETENTION_NOTE = 'Zehn Jahre nach §147 AO; Belege werden nicht gelöscht.';

export const STORED_DATA: readonly StoredDatum[] = [
  {
    subject: 'Name und E-Mail-Adresse des Kontos',
    purpose: 'Anmeldung, Zuordnung von Belegen zu ihrem Urheber',
    retentionMs: null,
    retentionNote: 'Solange das Konto besteht. Ausgeschiedene Konten werden gesperrt, nicht gelöscht — der Beleg behält seinen Urheber.',
  },
  {
    subject: 'Sitzung (Kennung, Zeitpunkt der letzten Nutzung, Gerätebeschreibung)',
    purpose: 'Angemeldet bleiben; eigene Sitzungen einsehen und beenden',
    retentionMs: SESSION_LIFETIME_MS,
  },
  {
    subject: 'Nachweis des zweiten Anmeldeschritts',
    purpose: 'Zweiter Faktor, ohne das Passwort erneut zu erfragen',
    retentionMs: PENDING_LOGIN_TTL_MS,
  },
  {
    subject: 'Vertrautes Gerät',
    purpose: 'Zweiten Faktor auf diesem Gerät für eine Weile aussetzen',
    retentionMs: TRUSTED_DEVICE_TTL_MS,
  },
  {
    subject: 'Fehlversuche bei der Anmeldung',
    purpose: 'Sperre nach zu vielen Versuchen',
    retentionMs: LOCKOUT_DURATION_MS,
    retentionNote: `Die Sperre greift nach ${String(MAX_FAILED_LOGINS)} Fehlversuchen und endet von selbst.`,
  },
  {
    subject: 'Einladung (Adresse und Tokenhash)',
    purpose: 'Ein Konto entsteht ausschließlich per Einladung',
    retentionMs: INVITATION_TTL_MS,
  },
  {
    subject: 'Zurücksetzung des Passworts (Tokenhash)',
    purpose: 'Vergessenes Passwort neu setzen',
    retentionMs: PASSWORD_RESET_TTL_MS,
  },
  {
    subject: 'Passkey (öffentlicher Schlüssel, Zähler, Gerätebeschreibung)',
    purpose: 'Anmeldung ohne Passwort; Erkennung geklonter Schlüssel',
    retentionMs: null,
    retentionNote: 'Bis der Passkey entfernt wird.',
  },
  {
    subject: 'Protokoll (Zeitpunkt, Aktion, handelndes Konto, IP-Adresse)',
    purpose: 'Nachvollziehbarkeit von Änderungen an Belegen und Stammdaten',
    retentionMs: null,
    retentionNote: 'Unbefristet und unveränderlich — das Protokoll lässt sich über die Anwendung weder ändern noch löschen.',
  },
  {
    subject: 'Rechnungen samt Empfängerangaben',
    purpose: 'Rechnungsstellung und steuerliche Aufbewahrung',
    retentionMs: null,
    retentionNote: INVOICE_RETENTION_NOTE,
  },
];

/**
 * Zusagen der Software, die keine Frist haben.
 *
 * Sie stehen als Anforderungen im Katalog (NFA-COMP-02, -05, -06) und werden
 * hier zum ersten Mal für Menschen aufgeschrieben.
 */
export const PRIVACY_ASSURANCES: readonly string[] = [
  'Es werden keine Daten an Dritte übertragen. Die Anwendung funktioniert ohne ausgehende Internetverbindung.',
  'Es sind keine externen Schriftarten, Skripte oder Analysedienste eingebunden; es findet keine Reichweitenmessung statt.',
  'Gesetzt werden ausschließlich technisch notwendige Cookies: Sitzung, Schutz vor Anfragen fremder Herkunft, zweiter Anmeldeschritt und vertrautes Gerät. Eine Einwilligung ist dafür nicht erforderlich, und es gibt keine, die erteilt werden könnte.',
  'Das Protokoll ist unveränderlich: Einträge lassen sich über die Anwendung weder ändern noch löschen.',
];

/** Millisekunden als deutscher Fristsatz — „7 Tage", „24 Stunden", „5 Minuten". */
export function formatRetention(ms: number): string {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (ms % day === 0) {
    const days = ms / day;
    return days === 1 ? '1 Tag' : `${String(days)} Tage`;
  }
  if (ms % hour === 0) {
    const hours = ms / hour;
    return hours === 1 ? '1 Stunde' : `${String(hours)} Stunden`;
  }

  const minutes = Math.round(ms / minute);
  return minutes === 1 ? '1 Minute' : `${String(minutes)} Minuten`;
}
