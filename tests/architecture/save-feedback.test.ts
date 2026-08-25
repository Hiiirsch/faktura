/**
 * Jede Speicheraktion bestätigt sichtbar (M12 — FA-UI-28).
 *
 * **Warum das ein Architekturtest ist und keine Klickprüfung.** Eine fehlende
 * Bestätigung ist die Sorte Mangel, die niemandem auffällt: Es erscheint kein
 * Fehler, es hängt nichts, es sieht nur aus wie vorher. Am Bildschirm bemerkt
 * man ihn erst, wenn man es genau darauf anlegt — im Quelltext ist er
 * abzählbar.
 *
 * Zwei Formen, weil es zwei Arten von Aktionen gibt:
 *
 * - Ein Formular mit `useActionState` hat einen Rückkanal. Sein
 *   `'saved'`-Zustand trägt einen Zeitstempel, und die Komponente zeigt einen
 *   `SaveToast`.
 * - Eine Aktion ohne Rückgabewert hat keinen. Sie endet mit einer Umleitung auf
 *   `?erledigt=…`, und die Zielseite macht daraus einen `Toast`.
 *
 * Der Zeitstempel ist selbst eine Lehre: Ohne ihn zeigte der Toast beim
 * **zweiten** Speichern nichts mehr, weil `useActionState` den vorigen Zustand
 * behält und die Komponente nicht neu entstand.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

/** Alle `actions.ts` unter `src/app`. */
async function actionFiles(directory = 'src/app'): Promise<string[]> {
  const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await actionFiles(relative)));
    } else if (entry.name === 'actions.ts') {
      files.push(relative);
    }
  }

  return files;
}

/** Formulare, deren Aktion einen `'saved'`-Zustand zurückgibt. */
const STATEFUL_FORMS = [
  'src/app/settings/company/company-form.tsx',
  'src/app/settings/company/logo-form.tsx',
  'src/app/settings/company/letterhead-form.tsx',
  'src/app/customers/customer-form.tsx',
  'src/app/catalog/catalog-form.tsx',
  'src/app/settings/numbering/numbering-forms.tsx',
  'src/app/settings/templates/template-forms.tsx',
  'src/app/settings/roles/role-form.tsx',
  'src/app/invoices/invoice-editor.tsx',
  // Die eigene Sicherheit eines Betreiberkontos (M14.1): Der Knopf steht am
  // Ende eines Abschnitts, eine Meldung über dem ersten Feld sähe man nicht.
  'src/app/admin/security/password-form.tsx',
];

async function read(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), path.normalize(relative)), 'utf8');
}

describe('FA-UI-28 Gespeichert heißt sichtbar gespeichert', () => {
  it.each(STATEFUL_FORMS)('%s zeigt eine Bestätigung', async (file) => {
    const source = await read(file);
    expect(source).toContain('SaveToast');
  });

  it('führt jeden `saved`-Zustand mit einem Zeitstempel', async () => {
    // Ohne ihn bliebe der Toast beim zweiten Speichern aus.
    const offenders: string[] = [];

    for (const file of await actionFiles()) {
      const source = await read(file);
      for (const match of source.matchAll(/status: 'saved'([^}]*)\}/g)) {
        if (!(match[1] ?? '').includes('savedAt')) {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('bestätigt auch die stillen Aktionen der Sicherheitsseite', async () => {
    /*
     * Fünf Aktionen ohne Rückgabewert: zweiten Faktor abschalten, Sitzung
     * beenden, alle anderen beenden, Gerätevertrauen entziehen, Passkey
     * entfernen. Bis M12 endete jede mit einem `revalidatePath` — der Eintrag
     * verschwand, und ob das die Handlung war, musste man erraten.
     */
    const actions = await read('src/app/settings/security/actions.ts');
    const page = await read('src/app/settings/security/page.tsx');

    const keys = [...actions.matchAll(/done\('([^']+)'\)/g)].map((match) => match[1]);

    expect(keys).toHaveLength(5);
    for (const key of keys) {
      // Jeder ausgesendete Schlüssel muss auf der Seite eine Meldung finden.
      expect(page).toContain(`case '${key ?? ''}':`);
    }
    expect(page).toContain('<Toast message={notice} />');
  });

  it('lässt keine stille Aktion auf der Sicherheitsseite zurück', async () => {
    const actions = await read('src/app/settings/security/actions.ts');

    // Übrig bleiben genau die zwei Aktionen mit eigenem Rückkanal: Sie zeigen
    // Wiederherstellungscodes an und dürfen die Seite deshalb nicht verlassen.
    const revalidations = [...actions.matchAll(/^ {2}revalidatePath\(/gm)];
    expect(revalidations).toHaveLength(2);
  });
});
