/**
 * Was eine MDX-Datei außer ihrem Inhalt noch ausführt (M16, FA-DOC-01).
 *
 * `@types/mdx` deklariert `*.mdx` mit einem Default-Export — der Komponente.
 * Jede Handbuchdatei führt zusätzlich ein `meta` mit Kennung, Titel und
 * Zusammenfassung; ohne diese Ergänzung wäre der Import ein Typfehler.
 *
 * **Die Deklaration ergänzt, sie ersetzt nicht.** TypeScript führt gleichnamige
 * Moduldeklarationen zusammen; `mdx/types` kommt weiterhin aus `@types/mdx`.
 *
 * Getippt statt `unknown`: Die Übersicht liest `title` und `summary`, die Route
 * liest `id`. Ein Tippfehler in einer der zwölf Dateien soll beim Übersetzen
 * auffallen und nicht als leere Stelle auf der Seite.
 */
declare module '*.mdx' {
  export const meta: {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
  };
}
