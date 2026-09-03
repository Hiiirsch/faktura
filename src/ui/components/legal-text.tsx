import type { ReactNode } from 'react';

/**
 * Hinterlegter Text als Absätze — **niemals als Markup** (M13, NFA-COMP-09).
 *
 * Der Inhalt kommt vom Betreiber der Installation. Der ist kein Angreifer, und
 * trotzdem wird hier nichts ausgeführt: Ein `dangerouslySetInnerHTML` an dieser
 * Stelle wäre eine gespeicherte XSS-Lücke auf einer **öffentlichen** Seite —
 * die einzige der Anwendung, die fremden Inhalt zeigt. Ein Betreiberkonto
 * bekäme damit einen Weg, Skript in den Browser jedes Besuchers zu bringen, und
 * die Trennung der beiden Identitäten (M8) wäre an dieser Stelle wieder offen.
 *
 * Der Preis ist gering: Absätze entstehen aus Leerzeilen, Zeilenumbrüche
 * bleiben Zeilenumbrüche. Für ein Impressum genügt das — es ist eine Anschrift
 * und ein paar Zeilen Text, keine Broschüre.
 */
export function LegalText({ content }: { readonly content: string }): ReactNode {
  const paragraphs = content
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return (
    <div className="flex max-w-text flex-col gap-4">
      {paragraphs.map((paragraph, index) => (
        <p
          // Der Text selbst ist kein stabiler Schlüssel — zwei gleiche Absätze
          // sind erlaubt. Die Position ist hier der richtige: Die Liste wird
          // nicht sortiert, gefiltert oder ergänzt.
          key={`${String(index)}`}
          className="whitespace-pre-line text-body text-ink"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}
