import Link from 'next/link';
import type { ReactNode } from 'react';

import { getLegalNotices } from '@/application/admin/legal-notices';
import { messages } from '@/i18n/de';
import { HELP_PATH, IMPRINT_PATH, PRIVACY_PATH } from '@/routes';
import { FOCUS_RING } from '@/ui/components/form';

/**
 * Der Weg zu Impressum und Datenschutzhinweisen (M13, NFA-COMP-07).
 *
 * **Ein Link erscheint nur, wohin er führt.** Das Impressum gibt es erst, wenn
 * der Betreiber eines hinterlegt hat; bis dahin verlinkt hier nichts darauf —
 * ein Link auf eine 404 wäre schlechter als kein Link. Dieselbe Regel wie bei
 * den Sammelaktionen aus M12.
 *
 * Die Datenschutzhinweise stehen dagegen **immer**: Ihr erster Teil beschreibt
 * die Software und ist auch ohne Zutun des Betreibers wahr.
 *
 * **Warum in `src/app/` und nicht in `src/ui/`.** Sie fragt die Datenbank —
 * über die Anwendungsschicht. `src/ui/**` darf die nicht sehen (NFA-ARCH-01),
 * und der Lint-Wächter hat das beim ersten Versuch sofort gemeldet. Ein Bauteil
 * mit Datenzugriff ist keine Darstellung, sondern eine Seitenkomposition.
 */
export async function LegalFooter(): Promise<ReactNode> {
  const notices = await getLegalNotices();

  return (
    <footer className="flex flex-wrap items-center gap-4 border-t border-rule pt-4 text-small text-ink-muted">
      {notices.imprint === null ? null : (
        <Link href={IMPRINT_PATH} className={`underline underline-offset-4 ${FOCUS_RING}`}>
          {messages.legal.imprintTitle}
        </Link>
      )}
      <Link href={PRIVACY_PATH} className={`underline underline-offset-4 ${FOCUS_RING}`}>
        {messages.legal.privacyTitle}
      </Link>

      {/*
        Das Handbuch (M16, FA-DOC-01).

        Hier und nicht in der Seitenleiste: So steht es auf der **Anmeldeseite**,
        auf der Passwortzurücksetzung und im `AppShell` — eine Stelle, drei
        Orte. Wer sich nicht anmelden kann, ist genau der, der nachlesen will.

        Es steht immer, ohne Bedingung: Das Handbuch wird mit der Software
        ausgeliefert, es kann nicht fehlen wie ein nicht hinterlegtes Impressum.
      */}
      <Link href={HELP_PATH} className={`underline underline-offset-4 ${FOCUS_RING}`}>
        {messages.help.navLabel}
      </Link>
    </footer>
  );
}
