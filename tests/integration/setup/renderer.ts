/**
 * Der Browser wird nach jeder Testdatei geschlossen (M12).
 *
 * **Warum das seit M12 nötig ist.** Das PDF entsteht beim Festschreiben
 * (FA-PDF-13), und damit startet jeder Test, der einen Beleg festschreibt,
 * einen Chromium — auch einer, der nie ein PDF ansieht. Ein offener Browser
 * hält den Node-Prozess am Leben; eine Datei, die ihn nicht schließt, lässt den
 * Testlauf am Ende hängen statt fehlschlagen. Das ist die unangenehmere Form
 * des Fehlschlags: Es sieht aus wie ein langsamer Test.
 *
 * Als `setupFiles` und nicht als Zeile in acht Testdateien: Der Zwang, daran zu
 * denken, wäre genau die Sorte Regel, die die neunte Datei vergisst.
 * `closeRenderer()` ist gutmütig — wo kein Browser läuft, tut es nichts.
 */
import { afterAll } from 'vitest';

import { closeRenderer } from '@/infrastructure/rendering/playwright-renderer';

afterAll(async () => {
  await closeRenderer();
});
