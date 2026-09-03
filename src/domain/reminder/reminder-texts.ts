/**
 * Der Wortlaut der Mahnung (M15, FA-MAHN-02).
 *
 * **Warum hier und nicht in `de.ts`.** Eine Mahnung ist die Ausgabe eines
 * Anwendungsfalls, kein Bildschirmtext — dieselbe Einordnung wie bei
 * `domain/notifications/mail-texts.ts` seit M14 und
 * `domain/legal/privacy-notice.ts` seit M13. `de.ts` bleibt, wofür es gedacht
 * ist: Texte, die jemand anklickt.
 *
 * **Der Ton steigt mit der Stufe, die Drohung nicht.** Faktura kündigt kein
 * gerichtliches Mahnverfahren an und nennt keine Inkassostelle: Was hier steht,
 * muss der Absender einhalten können, und eine angekündigte Folge, die
 * ausbleibt, entwertet jede weitere Mahnung. Die letzte Stufe sagt deshalb, dass
 * sie die letzte ist — mehr nicht.
 *
 * Kein Vorwurf und keine Unterstellung. Der häufigste Grund für eine
 * überfällige Rechnung ist, dass sie untergegangen ist.
 */
import type { ReminderLevel } from './dunning';

export type ReminderWording = {
  /** „Zahlungserinnerung", „Mahnung", „Letzte Mahnung" — Betreff und Bezeichnung. */
  readonly label: string;
  /** Der Absatz über der Aufstellung. */
  readonly intro: string;
  /** Der Absatz darunter, mit der neuen Frist. Enthält `{dueDate}`. */
  readonly outro: string;
};

const WORDING: Readonly<Record<ReminderLevel, ReminderWording>> = {
  1: {
    label: 'Zahlungserinnerung',
    intro:
      'zu der unten genannten Rechnung konnten wir bislang keinen Zahlungseingang feststellen. ' +
      'Vermutlich ist sie untergegangen — wir möchten Sie deshalb freundlich daran erinnern.',
    outro:
      'Bitte gleichen Sie den offenen Betrag bis zum {dueDate} aus. ' +
      'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es als gegenstandslos.',
  },
  2: {
    label: 'Mahnung',
    intro:
      'trotz unserer Erinnerung ist die unten genannte Rechnung weiterhin offen. ' +
      'Wir bitten Sie, den Betrag nun auszugleichen.',
    outro:
      'Bitte überweisen Sie den Gesamtbetrag bis zum {dueDate}. ' +
      'Haben Sie inzwischen gezahlt, betrachten Sie dieses Schreiben als gegenstandslos.',
  },
  3: {
    label: 'Letzte Mahnung',
    intro:
      'die unten genannte Rechnung ist trotz zweier Schreiben weiterhin offen. ' +
      'Dies ist unsere letzte Mahnung.',
    outro:
      'Bitte überweisen Sie den Gesamtbetrag bis zum {dueDate}. ' +
      'Sollte auch diese Frist verstreichen, müssen wir weitere Schritte prüfen. ' +
      'Haben Sie inzwischen gezahlt, betrachten Sie dieses Schreiben als gegenstandslos.',
  },
};

export function wordingForLevel(level: ReminderLevel): ReminderWording {
  return WORDING[level];
}

/**
 * Der Satz über den Verzug.
 *
 * Eine Zahl mit Einheit, kein Vorwurf: „seit 28 Tagen überfällig" ist eine
 * Feststellung, die der Empfänger nachrechnen kann. Der Singular ist kein
 * Beiwerk — „seit 1 Tagen" liest sich wie ein Fehler im Programm und lässt an
 * allem anderen zweifeln, was auf dem Blatt steht.
 */
export function overdueSentence(daysOverdue: number): string {
  if (!Number.isSafeInteger(daysOverdue) || daysOverdue < 1) {
    throw new RangeError(`Verzugstage müssen mindestens 1 sein: ${String(daysOverdue)}`);
  }

  return daysOverdue === 1
    ? 'Die Rechnung ist seit einem Tag überfällig.'
    : `Die Rechnung ist seit ${String(daysOverdue)} Tagen überfällig.`;
}

/** Setzt die neue Frist in den Schlusssatz ein. */
export function fillOutro(wording: ReminderWording, dueDate: string): string {
  return wording.outro.replace('{dueDate}', dueDate);
}
