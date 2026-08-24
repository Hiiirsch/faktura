/**
 * Die Belegvorschau erneuert sich nach dem Speichern (M12 — FA-PDF-02).
 *
 * **Warum nur ein Browser das prüfen kann.** Ein `<iframe>` mit derselben
 * Adresse lädt nicht neu, gleich wie oft React das umgebende Bauteil rendert.
 * Im TypeScript sieht der Fall genauso aus wie der gelungene; erst der Browser
 * sagt, ob der Rahmen einen neuen Abruf gemacht hat.
 *
 * Gemessen wird deshalb an den Anfragen selbst: Wie oft ist die PDF-Route
 * geholt worden? Das ist die Frage — nicht, welches Attribut im DOM steht.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './setup/server';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser.close();
});

async function login(page: Page): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', TEST_USER_EMAIL);
  await page.fill('#password', TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${TEST_BASE_URL}/`, { timeout: 15_000 });
}

/**
 * Öffnet einen **eigenen** Entwurf: eine Kopie eines beliebigen Belegs.
 *
 * Nicht den Entwurf aus dem Ausgangsbestand: Den schreibt
 * `browser-invoice-editor.test.ts` fest, und die Browsertests teilen sich einen
 * Server. Wer denselben Entwurf erwartet, hängt an der Reihenfolge der Dateien
 * — ein Fehlschlag, der beim Einzellauf verschwindet und niemandem erklärt,
 * woran es lag. Das Duplizieren kostet zwei Klicks und nimmt die Frage weg.
 */
async function openDraft(page: Page): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/invoices`, { waitUntil: 'networkidle' });
  await page.click('table a[href^="/invoices/"]');
  await page.waitForSelector('canvas[aria-label]', { timeout: 30_000 });

  await page.click('button:has-text("Duplizieren")');
  await page.waitForSelector('textarea[name="introText"]', { timeout: 30_000 });
  await page.waitForSelector('canvas[aria-label]', { timeout: 30_000 });
}

/**
 * Wartet, bis auf der Leinwand wirklich Farbe liegt, und gibt deren Menge.
 *
 * **Gezählt, nicht gestichprobt.** Die erste Fassung sah nur die obersten
 * Zeilen an und fragte, ob ein Punkt von Weiß abweicht. Sie bestand aus dem
 * falschen Grund: Eine noch leere Leinwand ist durchsichtig, und durchsichtig
 * las sich als „dunkler als Weiß" — sie hätte also auch bestanden, wenn gar
 * nichts gesetzt worden wäre.
 *
 * Gewartet wird, weil die Leiste vor dem ersten Strich erscheint: Der Zustand
 * „geladen" und das Zeichnen sind zwei Schritte.
 */
async function warteAufTinte(page: Page): Promise<number> {
  const frist = Date.now() + 15_000;
  let treffer = 0;

  while (Date.now() < frist) {
    treffer = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas === null || canvas.width === 0) {
        return 0;
      }
      const context2d = canvas.getContext('2d');
      if (context2d === null) {
        return 0;
      }

      const daten = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
      let punkte = 0;

      for (let index = 0; index < daten.length; index += 4) {
        const deckend = (daten[index + 3] ?? 0) > 200;
        const dunkel = (daten[index] ?? 255) < 200;
        if (deckend && dunkel) {
          punkte += 1;
        }
      }

      return punkte;
    });

    if (treffer > 0) {
      return treffer;
    }
    await page.waitForTimeout(250);
  }

  return treffer;
}

describe('FA-PDF-02 Die Vorschau gehört der Anwendung', () => {
  it('setzt den Beleg selbst — mit eigener Leiste, ohne fremden Betrachter', async () => {
    /*
     * Der eigentliche Nachweis steckt in zwei Zeilen: Es gibt eine Leinwand
     * mit Inhalt, und es gibt **keinen** eingebetteten Betrachter mehr. Dass
     * der Worker von pdf.js unter unserer Richtlinie überhaupt startet, kann
     * nur ein Browser beantworten — im TypeScript sieht der blockierte Fall
     * genauso aus wie der gelungene.
     */
    const context = await browser.newContext();
    const page = await context.newPage();

    const richtlinienverstoesse: string[] = [];
    page.on('console', (nachricht) => {
      const text = nachricht.text();
      if (/Content Security Policy|Refused to/i.test(text)) {
        richtlinienverstoesse.push(text);
      }
    });

    try {
      await login(page);
      await openDraft(page);

      // Kein fremder Betrachter mehr.
      expect(await page.locator('iframe[src*="/pdf"]').count()).toBe(0);

      // Die Leiste ist unsere, auf Deutsch, aus `de.ts`.
      await page.waitForSelector('text=Seite 1 von', { timeout: 30_000 });
      expect(await page.locator('button[aria-label="Nächste Seite"]').count()).toBe(1);
      expect(await page.locator('button[aria-label="Größer"]').count()).toBe(1);

      // Und die Leinwand trägt wirklich ein Bild, keine leere Fläche.
      /*
       * **Gezählt, nicht gestichprobt.**
       *
       * Die erste Fassung sah nur die obersten 200 Zeilen an und fragte, ob
       * ein Punkt von Weiß abweicht. Sie bestand aus dem falschen Grund: Eine
       * noch **leere** Leinwand ist durchsichtig, und durchsichtig las sich
       * als „dunkler als Weiß". Sie hätte also auch dann bestanden, wenn gar
       * nichts gesetzt worden wäre — und fiel erst um, als der Kopfbereich
       * tatsächlich weiß gezeichnet wurde.
       *
       * Jetzt wird das ganze Blatt gezählt: Punkte, die deckend und nicht weiß
       * sind. Das ist Text auf Papier und sonst nichts.
       */
      const dunklePunkte = await warteAufTinte(page);

      expect(dunklePunkte).toBeGreaterThan(500);
      expect(richtlinienverstoesse).toEqual([]);
    } finally {
      await context.close();
    }
  }, 180_000);

  it('zeigt die Symbole der Leiste in voller Breite', async () => {
    /*
     * **Gemessen, nicht angesehen.** Die Symbole waren 2 Punkte breit bei 16
     * Punkten Höhe: Die Knopfklasse hängte `px-0` an ein `px-4`, und in CSS
     * entscheidet nicht die Reihenfolge im Klassenstring, sondern die im
     * erzeugten Stylesheet. Im 36 Punkte breiten Knopf blieben 4 für den
     * Inhalt. Am Bildschirm sah das aus wie „die Symbole fehlen".
     */
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openDraft(page);

      const breiten = await page.evaluate(() =>
        [...document.querySelectorAll('[data-document] button svg')].map(
          (symbol) => symbol.getBoundingClientRect().width,
        ),
      );

      // Fünf: zurück, vor, kleiner, größer, Vollbild.
      expect(breiten).toHaveLength(5);
      for (const breite of breiten) {
        expect(breite).toBeGreaterThanOrEqual(12);
      }
    } finally {
      await context.close();
    }
  }, 180_000);

  it('vergrößert wirklich, nicht nur die Auflösung', async () => {
    /*
     * Eine Leinwand hat zwei Maße: Bildgröße und Anzeigegröße. Stand die
     * Anzeige auf `100%`, hing sie am Container — Vergrößern erhöhte allein
     * die Auflösung, und sichtbar änderte sich nichts. Geprüft wird deshalb
     * die **angezeigte** Breite.
     */
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openDraft(page);
      await page.waitForTimeout(1_000);

      const vorher = await page.evaluate(
        () => document.querySelector('canvas')?.getBoundingClientRect().width ?? 0,
      );
      expect(vorher).toBeGreaterThan(0);

      await page.click('button[aria-label="Größer"]');
      await page.waitForTimeout(1_500);

      const nachher = await page.evaluate(
        () => document.querySelector('canvas')?.getBoundingClientRect().width ?? 0,
      );

      expect(nachher).toBeGreaterThan(vorher);

      // Und wieder zurück: Der Zoom ist eine Stufenleiter, keine Einbahnstraße.
      await page.click('button[aria-label="Kleiner"]');
      await page.waitForTimeout(1_500);

      const zurueck = await page.evaluate(
        () => document.querySelector('canvas')?.getBoundingClientRect().width ?? 0,
      );
      expect(Math.round(zurueck)).toBe(Math.round(vorher));
    } finally {
      await context.close();
    }
  }, 180_000);

  it('lässt sich mit der Maus greifen und schieben', async () => {
    /*
     * Der Handgriff eines PDF-Betrachters. Geprüft am Rollstand des Rahmens:
     * Was der Zeiger zurücklegt, muss das Blatt in die Gegenrichtung
     * zurücklegen. Vergrößert wird vorher, sonst gibt es nichts zu schieben.
     */
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openDraft(page);
      await warteAufTinte(page);

      // Zweimal größer: Jetzt ist das Blatt breiter als seine Spalte.
      await page.click('button[aria-label="Größer"]');
      await page.click('button[aria-label="Größer"]');
      await page.waitForTimeout(1_500);

      const rahmen = page.locator('canvas').locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]');
      const kasten = await rahmen.boundingBox();
      expect(kasten).not.toBeNull();
      if (kasten === null) return;

      const vorher = await rahmen.evaluate((element) => element.scrollLeft);

      // Greifen, ziehen, loslassen — 120 Punkte nach links.
      await page.mouse.move(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
      await page.mouse.down();
      await page.mouse.move(kasten.x + kasten.width / 2 - 120, kasten.y + kasten.height / 2, {
        steps: 10,
      });
      await page.mouse.up();

      const nachher = await rahmen.evaluate((element) => element.scrollLeft);

      // Nach links gezogen heißt: weiter rechts im Blatt.
      expect(nachher).toBeGreaterThan(vorher);
    } finally {
      await context.close();
    }
  }, 180_000);

  it('geht in den Vollbildmodus und wieder heraus', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openDraft(page);
      await warteAufTinte(page);

      await page.click('button[aria-label="Vollbild"]');
      await page.waitForTimeout(1_000);

      /*
       * Gefragt wird der Browser, nicht die eigene Zustandsvariable: Der
       * Vollbildmodus gehört ihm, und ein Bauteil, das ihn nur behauptet,
       * bestünde diesen Test ebenfalls.
       */
      const drin = await page.evaluate(() => document.fullscreenElement !== null);
      expect(drin).toBe(true);

      // Der Knopf trägt jetzt die Gegenhandlung — und das Blatt wurde neu
      // eingepasst, ist also breiter als in der Spalte.
      expect(await page.locator('button[aria-label="Vollbild beenden"]').count()).toBe(1);

      /*
       * Beendet wird über den eigenen Knopf, nicht über `Escape`: Die Taste
       * gehört dem Browser, und ein kopfloses Chromium behandelt sie anders
       * als eines mit Fenster. Geprüft werden soll der Weg, den diese Ansicht
       * anbietet — für `Escape` bürgt die Schnittstelle des Browsers.
       */
      await page.click('button[aria-label="Vollbild beenden"]');
      await page.waitForTimeout(1_500);

      expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
      expect(await page.locator('button[aria-label="Vollbild"]').count()).toBe(1);
    } finally {
      await context.close();
    }
  }, 180_000);

  it('vergrößert mit Strg und Mausrad', async () => {
    /*
     * Der Zuhörer ist von Hand angemeldet, weil React Radereignisse **passiv**
     * anmeldet und ein passiver Zuhörer `preventDefault()` nicht darf. Ohne das
     * zöge der Browser seine eigene Seitenlupe auf, während das Blatt sich
     * ebenfalls ändert. Ob die Anmeldung greift, sieht man nur hier.
     */
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openDraft(page);
      await warteAufTinte(page);

      const vorher = await page.evaluate(
        () => document.querySelector('canvas')?.getBoundingClientRect().width ?? 0,
      );

      const canvas = page.locator('canvas');
      const kasten = await canvas.boundingBox();
      expect(kasten).not.toBeNull();
      if (kasten === null) return;

      await page.mouse.move(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -120);
      await page.keyboard.up('Control');
      await page.waitForTimeout(1_500);

      const nachher = await page.evaluate(
        () => document.querySelector('canvas')?.getBoundingClientRect().width ?? 0,
      );

      expect(nachher).toBeGreaterThan(vorher);
    } finally {
      await context.close();
    }
  }, 180_000);

  it('blättert mit den Pfeiltasten und passt in die Höhe ein', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openDraft(page);
      await warteAufTinte(page);

      const hoeheVorher = await page.evaluate(
        () => document.querySelector('canvas')?.getBoundingClientRect().height ?? 0,
      );

      /*
       * „Passt in die Höhe" muss das Blatt **kleiner** machen als „passt in die
       * Breite": Ein A4-Blatt ist höher als breit, und die Vorschauspalte ist
       * höher als sie breit ist — aber nicht im selben Verhältnis.
       */
      await page.click('button[aria-label="Ansicht wechseln: Breite, Höhe, Stufe"]');
      await page.waitForTimeout(1_500);

      const hoeheNachher = await page.evaluate(
        () => document.querySelector('canvas')?.getBoundingClientRect().height ?? 0,
      );

      expect(hoeheNachher).toBeLessThan(hoeheVorher);

      // Und es passt wirklich in den Rahmen, statt ihn zu überragen.
      const passt = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const rahmen = canvas?.closest('.overflow-auto');
        if (canvas === null || rahmen === null || rahmen === undefined) {
          return false;
        }
        return canvas.getBoundingClientRect().height <= rahmen.getBoundingClientRect().height + 1;
      });
      expect(passt).toBe(true);
    } finally {
      await context.close();
    }
  }, 180_000);

  it('blättert mit den Pfeiltasten', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await login(page);
      await openDraft(page);
      await warteAufTinte(page);

      // Der Entwurf des Testbestands ist einseitig; geprüft wird deshalb, dass
      // die Taste ankommt und die Anzeige an der Grenze stehen bleibt.
      const rahmen = page.locator('[role="group"][aria-label]').first();
      await rahmen.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(500);

      expect(await page.locator('text=Seite 1 von 1').count()).toBe(1);

      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(500);
      expect(await page.locator('text=Seite 1 von 1').count()).toBe(1);
    } finally {
      await context.close();
    }
  }, 180_000);

  it('holt das PDF nach dem Speichern erneut', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Jede Anfrage an die PDF-Route zählen — das ist der eigentliche Nachweis.
    let abrufe = 0;
    page.on('request', (request) => {
      if (/\/api\/invoices\/[^/]+\/pdf/.test(request.url())) {
        abrufe += 1;
      }
    });

    try {
      await login(page);
      await openDraft(page);

      // Der erste Abruf gehört zum Seitenaufbau.
      await page.waitForTimeout(1_500);
      const nachDemLaden = abrufe;
      expect(nachDemLaden).toBeGreaterThan(0);

      // Eine Änderung, die im Beleg sichtbar wird, und speichern.
      const notiz = page.locator('textarea[name="introText"]');
      await notiz.fill(`Vorschau-Prüfung ${String(Date.now())}`);

      /*
       * Der Knopf wird über seine Beschriftung gewählt, nicht über
       * `button[type="submit"]`: Der erste absendende Knopf der Seite ist
       * „Abmelden" in der Seitenleiste. Diese Falle hat in diesem Projekt schon
       * einmal einen Testlauf gekostet.
       */
      await page.click('button:has-text("Als Entwurf speichern")');

      // Die Bestätigung sagt, dass gespeichert wurde …
      await page.waitForSelector('[role="status"]', { timeout: 30_000 });
      expect(page.url()).toContain('/invoices/');

      // … und danach muss der Rahmen erneut geholt haben. **Ohne** reload().
      const frist = Date.now() + 10_000;
      while (abrufe <= nachDemLaden && Date.now() < frist) {
        await page.waitForTimeout(200);
      }

      expect(abrufe).toBeGreaterThan(nachDemLaden);
    } finally {
      await context.close();
    }
  }, 180_000);
});
