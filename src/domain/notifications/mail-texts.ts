/**
 * Der Wortlaut der zugestellten Nachrichten (M14, NFA-BETR-12).
 *
 * **Warum hier und nicht in `de.ts`.** Die Schichtenregel ist eindeutig: Die
 * Anwendungsschicht kennt keine Oberfläche (NFA-ARCH-01), und der Lint-Wächter
 * hat den ersten Versuch sofort gemeldet. Eine Mail ist aber auch keine
 * Oberfläche — sie ist die Ausgabe eines Anwendungsfalls, und ihr Wortlaut
 * gehört zu ihm.
 *
 * Das Vorbild steht seit M13 daneben: `domain/legal/privacy-notice.ts` trägt
 * ebenso deutsche Sätze, weil sie eine Aussage der Anwendung sind und nicht
 * die Beschriftung eines Knopfes. `de.ts` bleibt, wofür es gedacht ist —
 * Texte, die jemand auf einem Bildschirm anklickt.
 *
 * **Reiner Text, kein Markup.** Und kein Satz, der zum Klicken drängt: Eine
 * Nachricht, die wie eine Werbemail klingt, ist von einer Werbemail nicht zu
 * unterscheiden — und genau davor werden dieselben Empfänger geschult. Der
 * Anlass steht zuerst, die Frist dabei, und der Link als Adresse zum Lesen,
 * bevor man ihn öffnet.
 *
 * Jede Nachricht sagt außerdem, **was geschieht, wenn man sie ignoriert**. Wer
 * eine unerwartete Mail bekommt, soll nicht raten müssen, ob er handeln muss.
 */
export type MailText = {
  readonly subject: string;
  /** Enthält `{link}` und `{until}`. */
  readonly body: string;
};

export const INVITATION_MAIL: MailText = {
  subject: 'Ihr Zugang zu Faktura',
  body:
    'Für Sie wurde ein Zugang zu Faktura eingerichtet.\n\n' +
    'Über diese Adresse setzen Sie Ihr Passwort:\n{link}\n\n' +
    'Der Link gilt bis {until} und lässt sich einmal einlösen.\n\n' +
    'Wenn Sie damit nichts anfangen können, ignorieren Sie diese Nachricht — ' +
    'ohne den Link entsteht kein Zugang.',
};

export const PASSWORD_RESET_MAIL: MailText = {
  subject: 'Passwort zurücksetzen',
  body:
    'Für Ihr Konto bei Faktura wurde ein neues Passwort angefordert.\n\n' +
    'Über diese Adresse setzen Sie es:\n{link}\n\n' +
    'Der Link gilt bis {until} und lässt sich einmal einlösen. Ihr bisheriges ' +
    'Passwort bleibt gültig, bis Sie ein neues gesetzt haben.\n\n' +
    'Haben Sie das nicht angefordert, ist nichts geschehen: Ohne den Link ' +
    'ändert sich nichts.',
};

export const ADMIN_SETUP_MAIL: MailText = {
  subject: 'Einrichtung Ihres Betreiberkontos',
  body:
    'Für Sie wurde ein Betreiberkonto in Faktura eingerichtet.\n\n' +
    'Über diese Adresse setzen Sie Passwort und zweiten Faktor:\n{link}\n\n' +
    'Der Link gilt bis {until} und lässt sich einmal einlösen.',
};

/** Setzt Adresse und Frist in den Wortlaut ein. */
export function fillMailText(
  text: MailText,
  values: { readonly link: string; readonly until: string },
): { readonly subject: string; readonly text: string } {
  return {
    subject: text.subject,
    text: text.body.replace('{link}', values.link).replace('{until}', values.until),
  };
}
