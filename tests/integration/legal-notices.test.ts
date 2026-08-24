/**
 * Impressum und Datenschutzhinweise (M13 — NFA-COMP-07, -08, -09).
 *
 * **Die eine Zusage, die nur hier zu prüfen ist:** Das Lesen kommt ohne
 * Nachweis aus. Die öffentlichen Seiten müssen ohne jede Sitzung antworten —
 * ein Impressum hinter einer Anmeldung wäre keins —, während das Schreiben
 * einen `PlatformContext` verlangt. Beides gegeneinander steht im Typsystem
 * nicht: Eine Funktion ohne Parameter sieht aus wie jede andere.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getLegalNotices, saveLegalNotices } from '@/application/admin/legal-notices';
import { getPlatformAuditTrail } from '@/application/admin/organization-admin';
import type { PlatformContext } from '@/infrastructure/repositories/platform-context';
import { platformContextOf } from '@/infrastructure/repositories/platform-context';

import { DATA_DATABASE_URL, resetDatabase } from './setup/database';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Der Nachweis wird hier von Hand hergestellt, nicht über zwei Anmeldeschritte.
 *
 * Was geprüft wird, ist nicht der Weg zur Sitzung — den prüft
 * `platform-admin.test.ts` —, sondern was mit einem gültigen Nachweis
 * geschieht.
 */
function platform(): PlatformContext {
  return platformContextOf('admin-fuer-rechtstexte');
}

beforeEach(async () => {
  await prisma.$disconnect();
  await resetDatabase();
});

describe('NFA-COMP-07 Impressum des Betreibers', () => {
  it('gibt es zunächst nicht — und behauptet auch nichts', async () => {
    const notices = await getLegalNotices();

    expect(notices.imprint).toBeNull();
    expect(notices.privacyAddendum).toBeNull();
  });

  it('lässt sich hinterlegen und wieder entfernen', async () => {
    await saveLegalNotices(
      platform(),
      { imprint: 'Tim Hirschmiller\nHauptstr. 1\n89518 Heidenheim', privacyAddendum: '' },
      '::1',
    );

    const nachher = await getLegalNotices();
    expect(nachher.imprint).toContain('Heidenheim');
    // Ein leeres Feld ist kein hinterlegter Text, sondern keiner.
    expect(nachher.privacyAddendum).toBeNull();

    await saveLegalNotices(platform(), { imprint: '   ', privacyAddendum: '' }, null);
    expect((await getLegalNotices()).imprint).toBeNull();
  });

  it('wird beim Lesen **ohne** Nachweis herausgegeben', async () => {
    /*
     * Die eigentliche Zusage dieses Bausteins. `getLegalNotices()` nimmt keinen
     * Kontext — die öffentliche Seite hat keinen. Dass das Absicht ist und kein
     * vergessener Parameter, hält dieser Fall fest.
     */
    await saveLegalNotices(platform(), { imprint: 'Angaben', privacyAddendum: '' }, null);

    const ohneJedenNachweis = await getLegalNotices();
    expect(ohneJedenNachweis.imprint).toBe('Angaben');
  });

  it('bleibt bei genau einer Zeile, gleich wie oft gespeichert wird', async () => {
    await saveLegalNotices(platform(), { imprint: 'erste', privacyAddendum: '' }, null);
    await saveLegalNotices(platform(), { imprint: 'zweite', privacyAddendum: '' }, null);
    await saveLegalNotices(platform(), { imprint: 'dritte', privacyAddendum: '' }, null);

    expect(await prisma.platformSettings.count()).toBe(1);
    expect((await getLegalNotices()).imprint).toBe('dritte');
  });
});

describe('FA-ADM-14 Der Vorgang steht im Protokoll der Verwaltung', () => {
  it('vermerkt die Änderung ohne den Inhalt', async () => {
    await saveLegalNotices(
      platform(),
      { imprint: 'Tim Hirschmiller, Heidenheim', privacyAddendum: 'Verantwortlicher …' },
      '::1',
    );

    const entries = await getPlatformAuditTrail(platform(), 10);
    const entry = entries.find((row) => row.entityType === 'PlatformSettings');

    expect(entry).toBeDefined();
    expect(entry?.organizationId).toBeNull();

    /*
     * Der Inhalt selbst gehört nicht ins Protokoll: Es genügt, dass jemand ihn
     * geändert hat und wann. Ein Impressum in dreißig Fassungen im Protokoll
     * hilft niemandem — und ein Protokoll ist unveränderlich.
     */
    const json = JSON.stringify(entries);
    expect(json).not.toContain('Hirschmiller');
    expect(json).not.toContain('Verantwortlicher');
  });
});
