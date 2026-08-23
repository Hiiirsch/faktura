/**
 * Erzeugung von Beleg-HTML und -PDF
 * (FA-PDF-01 bis -11; FA-NUM-10; FA-TPL-05, -09; NFA-ARCH-06).
 *
 * Der Ablauf ist an einer Stelle beschrieben, weil Vorschau und Download
 * denselben Weg gehen müssen. Seit M5.6 gehen sie sogar denselben Weg **bis
 * zum Ende**: Die Vorschau zeigt das PDF selbst. Ein HTML-Abzug daneben hatte
 * einen Fehler, der sich nicht beheben ließ — `@page`-Ränder gelten nur beim
 * Drucken, am Bildschirm lief der Inhalt randlos über die volle Breite.
 *
 * Für einen festgeschriebenen Beleg entsteht das PDF **einmal** und wird als
 * Artefakt abgelegt. Jeder weitere Abruf liefert dieselbe Datei — deshalb
 * verändert eine spätere Vorlagenänderung bereits erzeugte PDFs nicht
 * (FA-TPL-09).
 */
import { buildFileName, DEFAULT_FILE_NAME_PATTERN } from '@/domain/document/file-name';
import type { InvoiceDocument } from '@/domain/document/invoice-document';
import {
  DEFAULT_PAGE_GEOMETRY,
  type PageGeometry,
  type PdfRenderOptions,
  type TemplateRenderError,
  type TemplateSource,
} from '@/domain/rendering/contracts';
import { err, ok, type Result } from '@/domain/shared/result';
import {
  createArtifact,
  deleteArtifact,
  findArtifact,
} from '@/infrastructure/repositories/artifact-repository';
import { findCompanyProfile } from '@/infrastructure/repositories/company-repository';
import { findInvoice } from '@/infrastructure/repositories/invoice-repository';
import type { Authorized } from '@/application/auth/authorize';
import {
  countTemplates,
  createTemplate,
  findDefaultTemplate,
  findTemplate,
  type Template,
} from '@/infrastructure/repositories/template-repository';
import { documentFontFaces } from '@/infrastructure/rendering/document-font';
import { applyPostProcessors, defaultPipeline } from '@/infrastructure/rendering/pipeline';
import { readArtifact, storeArtifact } from '@/infrastructure/storage/artifact-store';
import {
  DEFAULT_TEMPLATE_CSS,
  DEFAULT_TEMPLATE_DESCRIPTION,
  DEFAULT_TEMPLATE_HTML,
  DEFAULT_TEMPLATE_NAME,
} from '@/infrastructure/templates/default-template';

import { buildInvoiceDocument } from './build-invoice-document';
import { logger } from '@/infrastructure/logging/logger';

/** Spec §8.4: Eine Vorlage darf den Renderer nicht beliebig lange binden. */
const RENDER_TIMEOUT_MS = 15_000;

export type RenderError =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NO_COMPANY_PROFILE' }
  | { readonly kind: 'NO_TEMPLATE' }
  | { readonly kind: 'TEMPLATE_FAILED'; readonly error: TemplateRenderError }
  | { readonly kind: 'RENDER_FAILED'; readonly message: string }
  | { readonly kind: 'TIMEOUT' };

export type RenderedPdf = {
  readonly pdf: Uint8Array;
  readonly fileName: string;
  readonly sha256: string | null;
  /**
   * Woher die Datei stammt (M12, FA-PDF-13).
   *
   * - `stored` — die beim Festschreiben abgelegte Datei. Das Original.
   * - `draft` — ein Entwurf, bei jedem Abruf neu gesetzt. Kein Original, aber
   *   auch keins behauptet.
   * - `substitute` — **die abgelegte Datei fehlt.** Was ausgeliefert wird, ist
   *   mit der heutigen Vorlage neu gesetzt und sieht dem Original nur ähnlich.
   *
   * Der dritte Fall war bis M12 von den anderen nicht zu unterscheiden: Fehlte
   * die Datei, wurde still neu gesetzt und ausgeliefert. Ein Dokument, das nicht
   * das Original ist, soll das nicht verschweigen.
   */
  readonly origin: 'stored' | 'draft' | 'substitute';
};

/**
 * Legt die mitgelieferte Standardvorlage an, falls die Organisation noch keine
 * Vorlage hat (FA-TPL-05, Spec §8.3).
 *
 * Beim ersten Beleg statt in der Migration: Die Vorlage ist Anwendungsinhalt,
 * kein Schema. Sie in SQL zu schreiben hieße, HTML und CSS in einer Migration
 * zu pflegen, die sich nie wieder ändern darf.
 */
export async function ensureDefaultTemplate(context: Authorized<'invoice.read'>): Promise<Template> {
  const existing = await findDefaultTemplate(context);
  if (existing !== null) {
    return existing;
  }

  // Es kann Vorlagen ohne Standardmarke geben, wenn jemand die Marke
  // weggenommen hat. Dann wird nicht stillschweigend eine zweite
  // Standardvorlage angelegt.
  const count = await countTemplates(context);
  const name = count === 0 ? DEFAULT_TEMPLATE_NAME : `${DEFAULT_TEMPLATE_NAME} (${String(count)})`;

  return createTemplate(context, {
    name,
    description: DEFAULT_TEMPLATE_DESCRIPTION,
    htmlSource: DEFAULT_TEMPLATE_HTML,
    cssSource: DEFAULT_TEMPLATE_CSS,
    pageFormat: DEFAULT_PAGE_GEOMETRY.format,
    marginTopMm: DEFAULT_PAGE_GEOMETRY.marginTopMm,
    marginRightMm: DEFAULT_PAGE_GEOMETRY.marginRightMm,
    marginBottomMm: DEFAULT_PAGE_GEOMETRY.marginBottomMm,
    marginLeftMm: DEFAULT_PAGE_GEOMETRY.marginLeftMm,
    isDefault: true,
  });
}

export function geometryOf(template: Template): PageGeometry {
  return {
    format: 'A4',
    marginTopMm: template.marginTopMm,
    marginRightMm: template.marginRightMm,
    marginBottomMm: template.marginBottomMm,
    marginLeftMm: template.marginLeftMm,
  };
}

/**
 * Baut die Vorlagenquelle samt eingebetteter Schrift.
 *
 * Die Schrift wird dem CSS der Vorlage **vorangestellt**, nicht angehängt: So
 * kann eine Vorlage die Familie überschreiben, ohne dass die `@font-face`-Regel
 * verloren geht.
 */
export async function templateSourceOf(template: Template): Promise<TemplateSource> {
  const fontFaces = await documentFontFaces();

  return {
    htmlSource: template.htmlSource,
    cssSource: `${fontFaces}\n${template.cssSource}`,
    geometry: geometryOf(template),
  };
}

/** Die Vorlage des Belegs: die zugeordnete, sonst die Standardvorlage. */
async function resolveTemplate(
  context: Authorized<'invoice.read'>,
  templateId: string | null,
): Promise<Template | null> {
  if (templateId !== null) {
    const assigned = await findTemplate(context, templateId);
    if (assigned !== null) {
      return assigned;
    }
  }
  return ensureDefaultTemplate(context);
}

/**
 * Gesetzt wird **ohne** Kopf- und Fußzeile.
 *
 * Die Seitenangabe erscheint erst ab Seite 2 (FA-PDF-06) und kann deshalb hier
 * nicht entstehen: Chromium fügt die Gesamtseitenzahl erst beim Drucken ein,
 * und in der Fußzeile lässt sich nicht darauf verzweigen. Sie wird
 * anschließend von `pageNumberStamp` aufgebracht.
 */
function renderOptions(geometry: PageGeometry): PdfRenderOptions {
  return { geometry, timeoutMs: RENDER_TIMEOUT_MS };
}

export type PreparedDocument = {
  readonly document: InvoiceDocument;
  readonly template: Template;
  readonly fileName: string;
};

async function prepare(
  context: Authorized<'invoice.read'>,
  invoiceId: string,
): Promise<Result<PreparedDocument, RenderError>> {
  const invoice = await findInvoice(context, invoiceId);
  if (invoice === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  const built = await buildInvoiceDocument(context, invoiceId);
  if (!built.ok) {
    return err(
      built.error.kind === 'NOT_FOUND'
        ? { kind: 'NOT_FOUND' }
        : { kind: 'NO_COMPANY_PROFILE' },
    );
  }

  const template = await resolveTemplate(context, invoice.templateId);
  if (template === null) {
    return err({ kind: 'NO_TEMPLATE' });
  }

  const company = await findCompanyProfile(context);
  const pattern = company?.pdfFileNamePattern ?? DEFAULT_FILE_NAME_PATTERN;

  return ok({
    document: built.document,
    template,
    fileName: buildFileName(pattern, {
      invoiceNumber: built.document.invoiceNumber,
      issueDate: built.document.issueDate,
      customerName: built.document.buyer.name,
      documentTypeLabel: built.document.documentTypeLabel,
    }),
  });
}

/**
 * Setzt einen Beleg in eine **noch nicht gespeicherte** Vorlage (FA-TPL-04).
 *
 * Für den Vorlagen-Editor: Wer eine Vorlage bearbeitet, will das Ergebnis
 * sehen, bevor er sie speichert. Der Weg ist derselbe wie sonst — dieselbe
 * Schrift, dieselbe Geometrie, dasselbe PDF —, nur die Quelle kommt aus dem
 * Formular statt aus der Datenbank.
 */
export async function renderWithSources(
  context: Authorized<'invoice.read'>,
  invoiceId: string,
  htmlSource: string,
  cssSource: string,
  geometry: PageGeometry,
): Promise<Result<Uint8Array, RenderError>> {
  const built = await buildInvoiceDocument(context, invoiceId);
  if (!built.ok) {
    return err(
      built.error.kind === 'NOT_FOUND' ? { kind: 'NOT_FOUND' } : { kind: 'NO_COMPANY_PROFILE' },
    );
  }

  const fontFaces = await documentFontFaces();
  const rendered = await defaultPipeline.templateEngine.render(built.document, {
    htmlSource,
    cssSource: `${fontFaces}\n${cssSource}`,
    geometry,
  });

  if (!rendered.ok) {
    return err({ kind: 'TEMPLATE_FAILED', error: rendered.error });
  }

  const result = await defaultPipeline.pdfRenderer.render(rendered.html, renderOptions(geometry));

  if (!result.ok) {
    return err(
      result.error.kind === 'TIMEOUT'
        ? { kind: 'TIMEOUT' }
        : { kind: 'RENDER_FAILED', message: result.error.message },
    );
  }

  return ok(await applyPostProcessors(result.pdf, defaultPipeline.postProcessors));
}

/** Erzeugt ein PDF, ohne es abzulegen — für Entwürfe und Vorschauen. */
export async function renderInvoicePdf(
  context: Authorized<'invoice.read'>,
  invoiceId: string,
): Promise<Result<RenderedPdf, RenderError>> {
  const prepared = await prepare(context, invoiceId);
  if (!prepared.ok) {
    return prepared;
  }

  const source = await templateSourceOf(prepared.value.template);
  const rendered = await defaultPipeline.templateEngine.render(prepared.value.document, source);

  if (!rendered.ok) {
    return err({ kind: 'TEMPLATE_FAILED', error: rendered.error });
  }

  const result = await defaultPipeline.pdfRenderer.render(
    rendered.html,
    renderOptions(geometryOf(prepared.value.template)),
  );

  if (!result.ok) {
    return err(
      result.error.kind === 'TIMEOUT'
        ? { kind: 'TIMEOUT' }
        : { kind: 'RENDER_FAILED', message: result.error.message },
    );
  }

  const processed = await applyPostProcessors(result.pdf, defaultPipeline.postProcessors);

  // Kein Original und keins behauptet: Ein Entwurf wird bei jedem Abruf neu
  // gesetzt (M12).
  return ok({ pdf: processed, fileName: prepared.value.fileName, sha256: null, origin: 'draft' });
}

/**
 * Das PDF für den Download (FA-PDF-01, -03).
 *
 * Ein **festgeschriebener** Beleg wird einmal gesetzt und abgelegt; jeder
 * weitere Abruf liefert dieselbe Datei. Ein **Entwurf** wird bei jedem Abruf
 * neu gesetzt und nicht abgelegt: Er hat keine Nummer, ist jederzeit änderbar,
 * und ein archiviertes PDF davon wäre irreführend. Die Vorlage kennzeichnet ihn
 * sichtbar.
 *
 * Die Unterscheidung steht hier und nicht in der Route, damit der Zugriff auf
 * den Belegstatus in der Anwendungsschicht bleibt.
 */
export async function renderInvoiceForDownload(
  context: Authorized<'invoice.read'>,
  invoiceId: string,
): Promise<Result<RenderedPdf, RenderError>> {
  const invoice = await findInvoice(context, invoiceId);
  if (invoice === null) {
    return err({ kind: 'NOT_FOUND' });
  }

  return invoice.status === 'DRAFT'
    ? renderInvoicePdf(context, invoiceId)
    : getOrCreateInvoicePdf(context, invoiceId);
}

/**
 * Das PDF eines festgeschriebenen Belegs (FA-PDF-01, FA-NUM-10).
 *
 * Seit M12 liegt es in aller Regel schon vor: Es entsteht beim Festschreiben
 * (FA-PDF-13). Diese Funktion liefert dann nur noch die abgelegte Datei aus.
 *
 * Der erzeugende Zweig bleibt trotzdem, und zwar für genau zwei Fälle: einen
 * Beleg aus der Zeit vor M12 und einen, bei dem das Setzen beim Festschreiben
 * fehlschlug. Ihn zu entfernen hieße, diesen Belegen ihr PDF zu nehmen.
 *
 * Schlägt das Ablegen fehl, wird der Datenbankeintrag wieder entfernt — ein
 * Eintrag ohne Datei liefe beim nächsten Abruf in einen Lesefehler statt in
 * eine erneute Erzeugung (FA-PDF-11).
 */
export async function getOrCreateInvoicePdf(
  context: Authorized<'invoice.read'>,
  invoiceId: string,
): Promise<Result<RenderedPdf, RenderError>> {
  const existing = await findArtifact(context, invoiceId, 'pdf');

  if (existing !== null) {
    try {
      const bytes = await readArtifact(existing.filePath);
      return ok({
        pdf: new Uint8Array(bytes),
        fileName: existing.fileName,
        sha256: existing.sha256,
        origin: 'stored',
      });
    } catch (error) {
      /*
       * Die Datei fehlt oder ist unlesbar — ein Datenverlust, kein Sonderfall
       * des Alltags.
       *
       * Das Artefakt ist unveränderlich und lässt sich nicht ersetzen. Der Beleg
       * wird deshalb neu gesetzt und ohne Ablage ausgeliefert, damit der Abruf
       * nicht ins Leere läuft — aber **gekennzeichnet** (M12): Was hier
       * herauskommt, trägt die heutige Vorlage und ist nicht mehr das Dokument,
       * das der Empfänger bekommen hat.
       */
      logger.error('artifact.read_failed', { invoiceId, error });
      const ersatz = await renderInvoicePdf(context, invoiceId);
      return ersatz.ok ? ok({ ...ersatz.value, origin: 'substitute' as const }) : ersatz;
    }
  }

  const rendered = await renderInvoicePdf(context, invoiceId);
  if (!rendered.ok) {
    return rendered;
  }

  const stored = await storeArtifact(invoiceId, 'pdf', rendered.value.pdf);

  const artifact = await createArtifact(context, invoiceId, {
    kind: 'pdf',
    filePath: stored.storagePath,
    sha256: stored.sha256,
    byteSize: stored.byteSize,
    fileName: rendered.value.fileName,
  });

  // Gegenprobe: Was abgelegt wurde, muss dem entsprechen, was ausgeliefert
  // wird. Andernfalls bleibt kein halber Zustand zurück.
  if (stored.byteSize !== rendered.value.pdf.length) {
    await deleteArtifact(context, artifact.id);
    return err({ kind: 'RENDER_FAILED', message: 'Artefakt unvollständig abgelegt' });
  }

  // Frisch abgelegt — ab hier ist es das Original (M12).
  return ok({ ...rendered.value, sha256: stored.sha256, origin: 'stored' as const });
}
