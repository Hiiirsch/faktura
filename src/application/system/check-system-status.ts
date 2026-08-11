/**
 * Ermittelt den Betriebszustand der Anwendung.
 *
 * Dient sowohl der Anzeige in der Oberfläche als auch dem Healthcheck des
 * Containers. Die Prüfung der Renderer-Verfügbarkeit kommt mit M5 hinzu
 * (NFA-BETR-08); bis dahin bleibt die Datenbank die einzige Komponente.
 */
import { getEnv } from '@/infrastructure/config/env';
import { pingDatabase } from '@/infrastructure/repositories/client';

export type ComponentState = 'UP' | 'DOWN';

export type SystemStatus = {
  readonly healthy: boolean;
  readonly checkedAt: Date;
  readonly timeZone: string;
  readonly components: {
    readonly database: ComponentState;
  };
};

/**
 * Prüft die Datenbank durch eine echte Abfrage über den ORM. Ein reiner
 * Verbindungsaufbau würde einen beschädigten oder nicht migrierten
 * Datenbestand nicht auffallen lassen.
 */
async function checkDatabase(): Promise<ComponentState> {
  try {
    await pingDatabase();
    return 'UP';
  } catch (error) {
    // Die Ursache gehört ins Log des Servers, aber nicht in die Antwort an den
    // Client (NFA-SEC-18). Ohne diese Ausgabe bliebe ein Ausfall der Datenbank
    // ein stummes „nicht betriebsbereit" ohne jeden Hinweis auf das Warum.
    console.error('[health] Datenbankprüfung fehlgeschlagen:', error);
    return 'DOWN';
  }
}

export async function checkSystemStatus(): Promise<SystemStatus> {
  const database = await checkDatabase();

  return {
    healthy: database === 'UP',
    checkedAt: new Date(),
    timeZone: getEnv().APP_TIMEZONE,
    components: { database },
  };
}
