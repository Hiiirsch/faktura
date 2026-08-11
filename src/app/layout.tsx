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
        {children}
      </body>
    </html>
  );
}
