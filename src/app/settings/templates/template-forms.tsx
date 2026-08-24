'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { TEMPLATE_PREVIEW_PATH } from '@/routes';
import {
  Alert,
  FormSection,
  INPUT_CLASS,
  NoScriptNotice,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TEXTAREA_CLASS,
  TextField,
} from '@/ui/components/form';
import { FileField } from '@/ui/components/file-field';
import { SaveToast } from '@/ui/components/toast';

import {
  createTemplateAction,
  updateTemplateAction,
  uploadTemplateAction,
  type TemplateFormState,
} from './actions';

const IDLE: TemplateFormState = { status: 'idle' };

function MarginFields({
  top,
  right,
  bottom,
  left,
}: {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}): ReactNode {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <TextField
        name="marginTopMm"
        label={messages.templates.marginTop}
        type="number"
        min={0}
        max={50}
        defaultValue={String(top)}
        numeric
        required
      />
      <TextField
        name="marginRightMm"
        label={messages.templates.marginRight}
        type="number"
        min={0}
        max={50}
        defaultValue={String(right)}
        numeric
        required
      />
      <TextField
        name="marginBottomMm"
        label={messages.templates.marginBottom}
        type="number"
        min={0}
        max={50}
        defaultValue={String(bottom)}
        numeric
        required
      />
      <TextField
        name="marginLeftMm"
        label={messages.templates.marginLeft}
        type="number"
        min={0}
        max={50}
        defaultValue={String(left)}
        numeric
        required
      />
    </div>
  );
}

export function NewTemplateForm({
  csrfToken,
  starter,
}: {
  readonly csrfToken: string;
  /** Quelltext, mit dem eine neue Vorlage beginnt — Inhalt, kein Chrome. */
  readonly starter: { readonly htmlSource: string; readonly cssSource: string };
}): ReactNode {
  const [state, action] = useActionState(createTemplateAction, IDLE);

  return (
    <form action={action} className="flex flex-col gap-4 border-t border-rule pt-6">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
      <NoScriptNotice message={messages.common.noScript} />

      <h2 className="text-section font-semibold text-ink">{messages.templates.createHeading}</h2>

      {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label={messages.templates.name} required />
        <TextField name="description" label={messages.templates.description} />
      </div>

      <MarginFields top={25} right={20} bottom={20} left={20} />

      <input type="hidden" name="htmlSource" value={starter.htmlSource} />
      <input type="hidden" name="cssSource" value={starter.cssSource} />

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.templates.create}
        </button>
      </div>
    </form>
  );
}

export type TemplateEditorProps = {
  readonly csrfToken: string;
  readonly template: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly htmlSource: string;
    readonly cssSource: string;
    readonly marginTopMm: number;
    readonly marginRightMm: number;
    readonly marginBottomMm: number;
    readonly marginLeftMm: number;
  };
  readonly previewInvoices: readonly { readonly id: string; readonly label: string }[];
};

/**
 * Vorlagen-Editor mit Vorschau (FA-TPL-04).
 *
 * Die Vorschau ist ein zweites Formular auf dieselben Felder, das in einen
 * `<iframe>` postet. Der Grund für zwei Formulare statt eines: Speichern und
 * Ansehen sind verschiedene Vorgänge, und die Vorschau soll auch dann laufen,
 * wenn die Vorlage noch gar nicht gespeichert werden kann.
 *
 * Aktualisiert wird **nach einer Eingabepause**, nicht bei jedem Tastendruck:
 * Jeder Durchgang setzt das ganze Dokument neu und erzeugt daraus ein PDF; bei
 * laufender Eingabe wäre das eine Anfrage je Zeichen.
 *
 * Im Rahmen steht seit M5.6 das PDF selbst. Ein `sandbox`-Attribut gibt es
 * deshalb nicht mehr — der eingebaute Betrachter des Browsers startet darunter
 * nicht.
 */
export function TemplateEditorForm({
  csrfToken,
  template,
  previewInvoices,
}: TemplateEditorProps): ReactNode {
  const [state, action] = useActionState(updateTemplateAction, IDLE);
  const [uploadState, uploadAction] = useActionState(uploadTemplateAction, IDLE);

  const [htmlSource, setHtmlSource] = useState(template.htmlSource);
  const [cssSource, setCssSource] = useState(template.cssSource);
  const [invoiceId, setInvoiceId] = useState(previewInvoices[0]?.id ?? '');

  const previewForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (invoiceId.length === 0) {
      return;
    }

    // 800 ms statt 600: Jede Aktualisierung setzt den Beleg neu **und** lässt
    // Chromium ein PDF daraus erzeugen. Bei laufender Eingabe wäre häufigeres
    // Anstoßen verworfene Arbeit.
    const timer = setTimeout(() => previewForm.current?.requestSubmit(), 800);
    return () => {
      clearTimeout(timer);
    };
  }, [htmlSource, cssSource, invoiceId]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <input type="hidden" name="templateId" value={template.id} />
          <NoScriptNotice message={messages.common.noScript} />

          {state.status === 'error' ? <Alert tone="error">{state.message}</Alert> : null}
          <SaveToast savedAt={state.status === 'saved' ? state.savedAt : null} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="name"
              label={messages.templates.name}
              defaultValue={template.name}
              required
            />
            <TextField
              name="description"
              label={messages.templates.description}
              defaultValue={template.description}
            />
          </div>

          <FormSection
            title={messages.templates.sectionGeometry}
            description={messages.templates.sectionGeometryHint}
          >
            <MarginFields
              top={template.marginTopMm}
              right={template.marginRightMm}
              bottom={template.marginBottomMm}
              left={template.marginLeftMm}
            />
          </FormSection>

          <div className="flex flex-col gap-2">
            <label htmlFor="htmlSource" className="text-ui font-medium text-ink">
              {messages.templates.htmlSource}
            </label>
            <textarea
              id="htmlSource"
              name="htmlSource"
              rows={18}
              spellCheck={false}
              value={htmlSource}
              onChange={(event) => {
                setHtmlSource(event.target.value);
              }}
              className={`${TEXTAREA_CLASS} font-mono text-small`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="cssSource" className="text-ui font-medium text-ink">
              {messages.templates.cssSource}
            </label>
            <textarea
              id="cssSource"
              name="cssSource"
              rows={14}
              spellCheck={false}
              value={cssSource}
              onChange={(event) => {
                setCssSource(event.target.value);
              }}
              className={`${TEXTAREA_CLASS} font-mono text-small`}
            />
          </div>

          <div>
            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              {messages.common.save}
            </button>
          </div>
        </form>

        <form action={uploadAction} className="flex flex-col gap-4 border-t border-rule pt-6">
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <input type="hidden" name="templateId" value={template.id} />

          <h2 className="text-section font-semibold text-ink">
            {messages.templates.sectionUpload}
          </h2>
          <p className="text-small text-ink-muted">{messages.templates.sectionUploadHint}</p>

          {uploadState.status === 'error' ? (
            <Alert tone="error">{uploadState.message}</Alert>
          ) : null}
          <SaveToast
            savedAt={uploadState.status === 'saved' ? uploadState.savedAt : null}
            message={messages.templates.uploaded}
          />

          <div className="flex flex-wrap items-end gap-3">
            <FileField
              name="file"
              label={messages.templates.uploadFile}
              accept=".html,.htm,.css,.zip"
            />
            <button type="submit" className={SECONDARY_BUTTON_CLASS}>
              {messages.templates.upload}
            </button>
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-section font-semibold text-ink">{messages.templates.preview}</h2>
        <p className="text-small text-ink-muted">{messages.templates.previewIntro}</p>

        {previewInvoices.length === 0 ? (
          <p className="text-body text-ink-muted">{messages.templates.previewNoInvoice}</p>
        ) : (
          <>
            <form
              ref={previewForm}
              method="post"
              action={TEMPLATE_PREVIEW_PATH}
              target="template-preview"
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
              <input type="hidden" name="htmlSource" value={htmlSource} />
              <input type="hidden" name="cssSource" value={cssSource} />
              <input type="hidden" name="marginTopMm" value={String(template.marginTopMm)} />
              <input type="hidden" name="marginRightMm" value={String(template.marginRightMm)} />
              <input type="hidden" name="marginBottomMm" value={String(template.marginBottomMm)} />
              <input type="hidden" name="marginLeftMm" value={String(template.marginLeftMm)} />

              <label className="flex flex-1 flex-col gap-2">
                <span className="text-label font-semibold uppercase text-ink-muted">
                  {messages.templates.previewInvoice}
                </span>
                <select
                  name="invoiceId"
                  value={invoiceId}
                  onChange={(event) => {
                    setInvoiceId(event.target.value);
                  }}
                  className={INPUT_CLASS}
                >
                  {previewInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.label}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" className={SECONDARY_BUTTON_CLASS}>
                {messages.templates.preview}
              </button>
            </form>

            {/*
              Das Blatt: die einzige erhabene Fläche der Anwendung, eckig und
              weiß (Frontend-Entwurf §1, FA-UI-02).
            */}
            <div className="bg-sheet shadow-sheet">
              <iframe
                name="template-preview"
                title={messages.templates.previewFrame}
                className="h-sheet-view w-full border-0"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
