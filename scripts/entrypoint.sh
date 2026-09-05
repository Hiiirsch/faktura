#!/bin/sh
# Startpunkt des Anwendungscontainers.
#
# Migrationen laufen beim Start (Spec §12, NFA-BETR-01). Schlagen sie fehl,
# startet der Server nicht — ein Betrieb gegen einen Datenbestand mit
# unbekanntem Schema wäre gefährlicher als ein ausbleibender Start.
#
# **Abschaltbar seit M17.** Bei mehreren Instanzen gegen dieselbe Datenbank
# liefe dieser Schritt in jedem Pod gleichzeitig. Prisma sperrt zwar die
# Migrationstabelle, aber der Wettlauf endet je nach Zeitpunkt in einem
# Startabbruch — und der sähe aus wie ein Fehler in der Anwendung. Wer mehrere
# Instanzen betreibt, setzt `RUN_MIGRATIONS=0` und lässt einen eigenen
# Vorgang (Init-Container, Job) migrieren, **bevor** die Instanzen starten.
#
# Die Vorgabe bleibt `1`: Die Einzelplatzinstallation soll mit einem Befehl
# hochkommen, ohne dass jemand an einen zweiten denken muss.
set -eu

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
    echo "Wende Datenbankmigrationen an ..."
    # Direkt der Einstiegspunkt des Pakets, nicht der Symlink aus node_modules/.bin:
    # Beim Kopieren ins Image wird der Symlink zur echten Datei aufgelöst und fände
    # seine Hilfsdateien dann im falschen Verzeichnis.
    node ./migrator/node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma
else
    echo "Migrationen übersprungen (RUN_MIGRATIONS=0)."
fi

echo "Starte Anwendungsserver ..."
exec node server.js
