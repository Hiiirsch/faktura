import { describe, expect, it } from 'vitest';

import {
  ADMIN_SETUP_MAIL,
  fillMailText,
  INVITATION_MAIL,
  type MailText,
  PASSWORD_RESET_MAIL,
} from '@/domain/notifications/mail-texts';

const ALL: readonly MailText[] = [INVITATION_MAIL, PASSWORD_RESET_MAIL, ADMIN_SETUP_MAIL];

describe('NFA-BETR-12 Der Wortlaut der zugestellten Nachrichten (M14)', () => {
  it.each(ALL.map((mail) => [mail.subject, mail] as const))(
    '„%s" nennt Adresse und Frist',
    (_subject, mail) => {
      // Ohne beide Platzhalter bliebe die Nachricht unvollständig, ohne dass es
      // jemand merkt: `replace` mit einem fehlenden Muster wirft nicht.
      expect(mail.body).toContain('{link}');
      expect(mail.body).toContain('{until}');
    },
  );

  it('setzt Adresse und Frist ein und lässt keinen Platzhalter stehen', () => {
    const filled = fillMailText(PASSWORD_RESET_MAIL, {
      link: 'https://faktura.example/password-reset/abc',
      until: '25. August 2026 um 09:00',
    });

    expect(filled.subject).toBe('Passwort zurücksetzen');
    expect(filled.text).toContain('https://faktura.example/password-reset/abc');
    expect(filled.text).toContain('25. August 2026 um 09:00');
    expect(filled.text).not.toMatch(/\{[a-z]+\}/u);
  });

  it('bleibt reiner Text — kein Markup, keine nachgeladenen Bilder', () => {
    // NFA-COMP-06: Diese Anwendung lädt nirgends etwas nach, auch nicht in
    // einer Mail. Ein `<img>` im Wortlaut wäre eine Lesebestätigung.
    for (const mail of ALL) {
      expect(mail.body).not.toMatch(/<[a-z]/iu);
    }
  });

  it('sagt jeweils, was bei Nichtstun geschieht', () => {
    // Wer eine unerwartete Nachricht bekommt, soll nicht raten müssen. Beim
    // Betreiberkonto entfällt der Satz: Dort ist der Empfänger bekannt, der
    // Vorgang abgesprochen, und der Link kommt aus einem Kommando auf dem
    // Server.
    expect(INVITATION_MAIL.body).toContain('ignorieren');
    expect(PASSWORD_RESET_MAIL.body).toContain('nicht angefordert');
  });
});
