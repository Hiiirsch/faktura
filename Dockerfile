# Anwendungscontainer (Spec §12).
#
# Chromium kommt aus der Paketverwaltung der Distribution, nicht als Download
# von Playwright. Zwei Gründe: Es bekommt Sicherheitsaktualisierungen über
# `apt`, statt als eingefrorener Stand im Image zu liegen, und das Image bleibt
# um die rund 150 MB kleiner, die der zweite Browser kosten würde.
#
# Gestartet wird **ohne** `--no-sandbox` (Spec §11.3). Dafür kommt
# `chromium-sandbox` mit: das setuid-Hilfsprogramm, mit dem Chromium seine
# Sandbox auch dort aufbaut, wo unprivilegierte User-Namespaces gesperrt sind —
# und das ist unter dem Standard-Seccomp-Profil von Docker der Fall. Ohne
# dieses Paket bliebe nur `--no-sandbox`, und genau das schließt die
# Spezifikation aus.

ARG NODE_VERSION=24.13.0

# ── Abhängigkeiten ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app

# Nur die Manifeste kopieren, damit die Ebene bei unverändertem
# Abhängigkeitsstand aus dem Cache kommt.
COPY package.json package-lock.json ./
RUN npm ci

# ── Werkzeug für Migrationen ────────────────────────────────────────────────
# Die Prisma-Kommandozeile bekommt einen eigenen Abhängigkeitsbaum, getrennt
# vom Anwendungsbündel. Einzelne Verzeichnisse aus node_modules zu kopieren
# reicht nicht: Die Kommandozeile bringt transitive Abhängigkeiten mit, die
# dabei zwangsläufig fehlen. Die Version stammt aus package.json, damit es
# nur eine Quelle dafür gibt.
FROM node:${NODE_VERSION}-bookworm-slim AS migrator
WORKDIR /migrator

# Die Prisma-Kommandozeile setzt OpenSSL voraus; das schlanke Basisimage bringt
# es nicht mit.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./app-package.json
RUN PRISMA_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('/migrator/app-package.json','utf8')).devDependencies.prisma")" \
    && echo "Prisma-Kommandozeile: ${PRISMA_VERSION}" \
    && npm init -y > /dev/null \
    && npm install --omit=optional --no-fund --no-audit "prisma@${PRISMA_VERSION}" \
    && rm app-package.json

# ── Build ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app

# OpenSSL muss schon beim Erzeugen des Prisma-Clients vorhanden sein: Die
# passende Abfrage-Engine wird anhand der vorgefundenen OpenSSL-Version gewählt.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Der Prisma-Client wird aus dem Schema erzeugt und in den Build übernommen.
RUN npx prisma generate

# Der Build prüft zugleich die Typen (NFA-QUAL-03).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Das Kommando zum Anlegen des Erstbenutzers (NFA-SEC-02) wird zu einer
# einzelnen Datei gebündelt. Andernfalls müssten TypeScript-Quellen und eine
# Laufzeit dafür mit ins Image — für ein Kommando, das genau einmal pro
# Installation läuft.
RUN npm run build:cli

# ── Laufzeit ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Innerhalb des Containers muss der Server auf allen Adressen lauschen, damit
# der Reverse Proxy ihn erreicht. Nach außen ist kein Port veröffentlicht —
# dafür sorgt docker-compose.yml (NFA-SEC-19).
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openssl ca-certificates \
        chromium \
        chromium-sandbox \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Der Renderer nimmt dieses Chromium statt des mitgelieferten. Die Schrift des
# Belegs kommt als data:-URI mit dem Dokument; `fonts-liberation` ist nur die
# Rückfallschrift für Kopf- und Fußzeile.
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Der Standardbenutzer `node` des Basisimages ist kein Root (NFA-SEC-20).
RUN mkdir -p /app/data /app/storage/artifacts && chown -R node:node /app

# Anwendungsbündel aus dem Standalone-Output.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Schema und Migrationen sowie die eigenständige Prisma-Kommandozeile.
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=migrator --chown=node:node /migrator/node_modules ./migrator/node_modules

# Gebündelte Kommandos für die Einrichtung (M8):
#
#   docker compose exec app node dist/create-admin.mjs --email <adresse>
#     Das erste Betreiberkonto. Danach entstehen Unternehmen und Konten in der
#     Oberfläche unter /admin — der Regelweg.
#
#   docker compose exec app node dist/create-user.mjs --email <adresse> \
#     --organization <kennung> [--role <kennung>]
#     Der Notfallweg, wenn niemand mehr in ein Unternehmen kommt.
COPY --from=builder --chown=node:node /app/dist ./dist

COPY --chown=node:node scripts/entrypoint.sh ./scripts/entrypoint.sh
RUN chmod +x ./scripts/entrypoint.sh

USER node
EXPOSE 3000

ENTRYPOINT ["./scripts/entrypoint.sh"]
