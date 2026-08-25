/**
 * Das Verzeichnis der Handbuchthemen (M16, FA-DOC-01).
 *
 * **Eine Liste von Hand und keine Verzeichnisabfrage.** Die Dateien zur
 * Laufzeit einzulesen, schiede aus — die Abhängigkeitsverfolgung des
 * Standalone-Builds sieht `readdir` nicht, und ein leeres Handbuch im Container
 * fiele erst beim Aufruf auf. Der Import bringt sie ins Bündel, und die
 * Reihenfolge hier ist zugleich die Reihenfolge im Inhaltsverzeichnis: vom
 * Anmelden bis zu den Grenzen, so wie jemand die Anwendung kennenlernt.
 */
import type { ComponentType } from 'react';

import Anmeldung, { meta as anmeldung } from './anmeldung.mdx';
import Daten, { meta as daten } from './daten.mdx';
import Festschreiben, { meta as festschreiben } from './festschreiben.mdx';
import Firmendaten, { meta as firmendaten } from './firmendaten.mdx';
import Grenzen, { meta as grenzen } from './grenzen.mdx';
import Mahnungen, { meta as mahnungen } from './mahnungen.mdx';
import Mitglieder, { meta as mitglieder } from './mitglieder.mdx';
import Rechnung, { meta as rechnung } from './rechnung.mdx';
import Sicherheit, { meta as sicherheit } from './sicherheit.mdx';
import Stammdaten, { meta as stammdaten } from './stammdaten.mdx';
import Vorlagen, { meta as vorlagen } from './vorlagen.mdx';
import Zahlungen, { meta as zahlungen } from './zahlungen.mdx';

export type HelpTopicMeta = {
  /** Zugleich Dateiname und letzter Teil der Adresse. */
  readonly id: string;
  readonly title: string;
  /** Ein Satz für die Übersicht — was in dem Thema steht. */
  readonly summary: string;
};

export type HelpTopic = {
  readonly meta: HelpTopicMeta;
  readonly Content: ComponentType;
};

export const HELP_TOPICS: readonly HelpTopic[] = [
  { meta: anmeldung, Content: Anmeldung },
  { meta: firmendaten, Content: Firmendaten },
  { meta: stammdaten, Content: Stammdaten },
  { meta: rechnung, Content: Rechnung },
  { meta: festschreiben, Content: Festschreiben },
  { meta: zahlungen, Content: Zahlungen },
  { meta: mahnungen, Content: Mahnungen },
  { meta: vorlagen, Content: Vorlagen },
  { meta: mitglieder, Content: Mitglieder },
  { meta: sicherheit, Content: Sicherheit },
  { meta: daten, Content: Daten },
  { meta: grenzen, Content: Grenzen },
];

export function findHelpTopic(id: string): HelpTopic | null {
  return HELP_TOPICS.find((topic) => topic.meta.id === id) ?? null;
}
