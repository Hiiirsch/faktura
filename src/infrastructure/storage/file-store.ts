/**
 * Wo Dateien liegen — der Vertrag (M17, B2).
 *
 * **Warum es diese Schicht seit M17 gibt.** Bis dahin schrieben Artefakt- und
 * Asset-Ablage unmittelbar auf das lokale Dateisystem. Das trägt genau so lange,
 * wie es **eine** Anwendungsinstanz gibt: Sobald zwei Instanzen gegen dieselbe
 * Datenbank laufen, schreibt die eine ein PDF beim Festschreiben, und die andere
 * findet es beim Abruf nicht. Der Beleg verwiese dann auf eine Datei, die es auf
 * diesem Rechner nie gab.
 *
 * Der Vertrag ist bewusst **schmal** — vier Operationen, keine Verzeichnisse,
 * keine Metadaten. Alles, was Faktura über eine Datei weiß, steht in der
 * Datenbank: Pfad, Prüfsumme, Größe, Anzeigename. Der Speicher hält Bytes unter
 * einem Schlüssel; mehr braucht er nicht zu können, und mehr sollte er nicht
 * versprechen müssen.
 *
 * **Der Schlüssel ist ein relativer Pfad mit Schrägstrichen** (`artifacts/<id>/pdf.pdf`),
 * kein Betriebssystempfad. Das Dateisystem übersetzt ihn in seine Trennzeichen,
 * ein Objektspeicher nimmt ihn wörtlich. Ein absoluter Pfad ist nie ein
 * gültiger Schlüssel — die Prüfung dafür liegt beim Adapter, weil nur er weiß,
 * wovor er sich schützen muss.
 */

export type FileStore = {
  /**
   * Legt Bytes unter dem Schlüssel ab und ersetzt, was dort lag.
   *
   * **Unteilbar oder gar nicht.** Ein abgebrochener Lauf darf nichts
   * Halbfertiges hinterlassen (FA-PDF-11) — was ein Leser danach vorfindet, ist
   * entweder der vollständige neue Inhalt oder der vollständige alte.
   */
  put(key: string, bytes: Uint8Array): Promise<void>;

  /** Liest die Bytes. Wirft, wenn es den Schlüssel nicht gibt. */
  get(key: string): Promise<Uint8Array>;

  /** Entfernt den Schlüssel. Ein nicht vorhandener ist kein Fehler. */
  remove(key: string): Promise<void>;

  /**
   * Entfernt alles unter einem Präfix.
   *
   * Für das Verwerfen aller Artefakte eines Belegs. Ein Präfix und keine Liste,
   * weil der Aufrufer nicht wissen kann, welche Arten von Artefakten es zu
   * einem Beleg gibt — heute `pdf`, später ZUGFeRD.
   */
  removePrefix(prefix: string): Promise<void>;
};
