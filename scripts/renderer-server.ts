/**
 * Der Renderdienst (M17, B3 — NFA-BETR-15).
 *
 * HTML hinein, PDF heraus. Mehr kann er nicht, und mehr soll er nicht können.
 *
 * **Warum ein eigener Prozess.** Chromium spannt seine Sandbox über
 * Namensräume auf und braucht dafür `SYS_ADMIN`, `SETUID`, `SETGID` und
 * `SYS_CHROOT`. In einer Umgebung mit strengem Sicherheitsprofil bekommt eine
 * Anwendungsinstanz diese Fähigkeiten nicht. Dieser Dienst bekommt sie — und
 * sonst nichts: Er kennt keine Datenbank, keine Sitzung, keinen Mandanten und
 * keinen Dateispeicher.
 *
 * **Er setzt denselben Renderer ein**, den die Anwendung im eigenen Prozess
 * benutzt (`playwright-renderer.ts`). Eine zweite Umsetzung wäre die zweite
 * Wahrheit: Ein Beleg sähe dann je nach Betriebsart anders aus, und der
 * Unterschied fiele erst am fertigen PDF auf.
 *
 * **Ohne `RENDERER_TOKEN` startet er nicht.** Ein Dienst, der aus beliebigem
 * HTML PDFs erzeugt, gehört nicht ungeschützt in ein Netz — auch nicht in ein
 * internes. Die Prüfung vergleicht in konstanter Zeit; ein Vergleich mit `===`
 * verriete über die Laufzeit, wie weit ein Versuch gekommen ist.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import type { PdfRenderOptions } from '@/domain/rendering/contracts';
import { logger } from '@/infrastructure/logging/logger';
import { closeRenderer, isRendererAvailable, playwrightPdfRenderer } from '@/infrastructure/rendering/playwright-renderer';

const PORT = Number(process.env['RENDERER_PORT'] ?? '3900');
const TOKEN = process.env['RENDERER_TOKEN'];

/** So viel HTML nimmt der Dienst entgegen — ein Beleg ist weit darunter. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

if (TOKEN === undefined || TOKEN.length < 16) {
  process.stderr.write('RENDERER_TOKEN fehlt oder ist zu kurz (mindestens 16 Zeichen).\n');
  process.exit(1);
}

function authorized(request: IncomingMessage): boolean {
  const header = request.headers.authorization ?? '';
  const presented = Buffer.from(header.replace(/^Bearer /u, ''));
  const expected = Buffer.from(`${TOKEN ?? ''}`);

  // `timingSafeEqual` verlangt gleiche Länge; die Längenprüfung vorweg verrät
  // nur die Länge, und die ist kein Geheimnis.
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Anfrage zu groß');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

type RenderRequest = { readonly html: string; readonly options: PdfRenderOptions };

function isRenderRequest(value: unknown): value is RenderRequest {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { html?: unknown; options?: unknown };
  return typeof candidate.html === 'string' && typeof candidate.options === 'object';
}

async function handleRender(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const parsed: unknown = JSON.parse(await readBody(request));

  if (!isRenderRequest(parsed)) {
    response.writeHead(400).end('Erwartet wird { html, options }.');
    return;
  }

  const result = await playwrightPdfRenderer.render(parsed.html, parsed.options);

  if (!result.ok) {
    // Eine Zeitüberschreitung bekommt einen eigenen Statuscode: Der Aufrufer
    // unterscheidet sie von einem Fehlschlag, ohne im Text zu lesen.
    const status = result.error.kind === 'TIMEOUT' ? 504 : 500;
    response.writeHead(status).end(result.error.kind);
    return;
  }

  response
    .writeHead(200, {
      'content-type': 'application/pdf',
      'content-length': String(result.pdf.length),
    })
    .end(Buffer.from(result.pdf));
}

const server = createServer((request, response) => {
  void (async () => {
    try {
      if (!authorized(request)) {
        response.writeHead(401).end('unauthorized');
        return;
      }

      if (request.method === 'GET' && request.url === '/health') {
        const healthy = await isRendererAvailable();
        response.writeHead(healthy ? 200 : 503).end(healthy ? 'ok' : 'renderer down');
        return;
      }

      if (request.method === 'POST' && request.url === '/render') {
        await handleRender(request, response);
        return;
      }

      response.writeHead(404).end('not found');
    } catch (error) {
      logger.error('renderer.request_failed', { error });
      if (!response.headersSent) {
        response.writeHead(500).end('render failed');
      }
    }
  })();
});

server.listen(PORT, () => {
  logger.info('renderer.started', { port: PORT });
});

/**
 * Ein offener Chromium hält den Node-Prozess am Leben (M12).
 *
 * Ohne diesen Abbau endete der Dienst auf ein `SIGTERM` hin nie — der Container
 * liefe in die Abbruchfrist und würde hart beendet, mitten in einem laufenden
 * Beleg.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void closeRenderer().then(() => {
        process.exit(0);
      });
    });
  });
}
