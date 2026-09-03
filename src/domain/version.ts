/**
 * Die Version der Anwendung (M16.3, FA-DOC-07).
 *
 * **Warum sie hier steht und nicht aus `package.json` gelesen wird.** Ein
 * `import` der `package.json` zöge die vollständige Abhängigkeitsliste ins
 * Browserbündel; ein Lesen zur Laufzeit erfasst die Abhängigkeitsverfolgung des
 * Standalone-Builds nicht — dieselbe Falle wie bei der Schriftdatei und der
 * Standardvorlage. Und die Domänenschicht liest keine Dateien.
 *
 * Der Preis ist eine zweite Fassung derselben Zahl. Genau deshalb steht sie
 * **nicht allein**: `tests/architecture/version.test.ts` hält sie gegen
 * `package.json` **und** gegen den jüngsten Eintrag im Handbuch. Wer eine der
 * drei Stellen ändert und die anderen vergisst, kommt dort nicht vorbei.
 *
 * **Schema.** Semantische Versionierung, bezogen auf den Betrieb einer
 * Installation — nicht auf eine Programmierschnittstelle, die es nicht gibt:
 *
 * - **Major** — eine Migration, die keinen Rückweg lässt, oder eine geänderte
 *   Zusage. Wer aktualisiert, liest vorher nach.
 * - **Minor** — neue Fähigkeiten. Aktualisieren ist gefahrlos.
 * - **Patch** — Behebungen, ohne dass sich etwas anders verhält als
 *   beschrieben.
 *
 * `1.0.0` ist der Stand, mit dem die Anwendung ihre Meilensteine M0 bis M16
 * abgeschlossen hat: Belege, Ausgabe, Mandanten, Rollen, Verwaltung, Zustellung,
 * Mahnwesen und Handbuch. Die `0.x` davor sind rückwirkend vergeben und
 * beschreiben Stände, die es als Auslieferung nie gab.
 */
export const APP_VERSION = '1.0.0';
