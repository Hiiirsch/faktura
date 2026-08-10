/**
 * Anzeigebezogene Einstellungen für Serverkomponenten.
 *
 * Die Anzeigeschicht darf die Konfiguration nicht selbst lesen; sie erhält die
 * Zeitzone über die Anwendungsschicht. Fest verdrahtete Zeitzonen in
 * Komponenten wären genau die Art Fehler, die erst bei einer Zeitumstellung
 * oder einem Serverumzug auffällt.
 */
import { getEnv } from '@/infrastructure/config/env';

export function getAppTimeZone(): string {
  return getEnv().APP_TIMEZONE;
}
