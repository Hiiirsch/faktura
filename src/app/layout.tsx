import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';

import './globals.css';

export const metadata: Metadata = {
  title: messages.app.name,
  description: messages.app.description,
  // Ein Rechnungssystem gehört nicht in einen Suchindex.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <html lang="de">
      <body className="min-h-screen bg-surface text-ink">
        {/*
          **Was ohne JavaScript nicht trägt, wird ohne JavaScript versteckt.**

          Ein Knopf, den es gibt und der nichts tut, ist schlechter als keiner.
          Die Alternative wäre gewesen, ihn erst nach der Hydratation zu setzen
          — ein Zustand, den React zu Recht rügt (`set-state-in-effect`), und
          ein Flackern beim ersten Rendern obendrein.

          Eine Regel im `<noscript>` kostet nichts, greift vor dem ersten
          Anstrich und gilt für jede künftige Ergänzung dieser Art. Inline-Stile
          erlaubt die Richtlinie (`style-src 'unsafe-inline'`); ein Skript wäre
          hier nicht möglich und wäre auch der falsche Weg.
        */}
        <noscript>
          <style>{`.js-only { display: none !important; }`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
