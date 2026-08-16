/**
 * Ermittelt den Betriebszustand der Anwendung (NFA-BETR-08).
 *
 * Zwei Komponenten, weil zwei Dinge unabhängig voneinander ausfallen können:
 * die Datenbank und der PDF-Renderer. Ein Dienst, dessen Chromium nicht
 * startet, nimmt Rechnungen entgegen und kann keine einzige ausliefern — ohne
 * die zweite Prüfung meldete er sich dabei als betriebsbereit.
 *
 * Beide werden **nebenläufig** geprüft: Der Healthcheck läuft im Container
 * regelmäßig, und nacheinander addierten sich die Zeiten.
 */
import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import { isRendererAvailable } from '@/infrastructure/rendering/playwright-renderer';
import { pingDatabase } from '@/infrastructure/repositories/client';

export type ComponentState = 'UP' | 'DOWN';

export type SystemStatus = {
  readonly healthy: boolean;
  readonly checkedAt: Date;
  readonly timeZone: string;
  readonly components: {
    readonly database: ComponentState;
    readonly renderer: ComponentState;
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
    logger.error('health.database_down', { error });
    return 'DOWN';
  }
}

/**
 * Prüft den Renderer durch einen echten Browserstart.
 *
 * Die Begründung steht bei `isRendererAvailable()`: Ein Chromium, das nicht
 * hochkommt, liegt trotzdem an seinem Pfad.
 */
async function checkRenderer(): Promise<ComponentState> {
  return (await isRendererAvailable()) ? 'UP' : 'DOWN';
}

export async function checkSystemStatus(): Promise<SystemStatus> {
  const [database, renderer] = await Promise.all([checkDatabase(), checkRenderer()]);

  return {
    healthy: database === 'UP' && renderer === 'UP',
    checkedAt: new Date(),
    timeZone: getEnv().APP_TIMEZONE,
    components: { database, renderer },
  };
}
