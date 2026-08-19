'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { Alert, INPUT_CLASS, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';

/**
 * Einen Passkey anlegen (M9, FA-PASS-03).
 *
 * **Client-Komponente ohne Ausweichweg** — anders als der Rest der Anwendung.
 * WebAuthn ist eine Browser-API; ohne JavaScript gibt es keine Zeremonie. Der
 * Knopf erscheint deshalb gar nicht erst, wo er nur eine wortlose Ablehnung
 * erzeugen könnte: Die Seite prüft vorher, ob die Adresse überhaupt ein sicherer
 * Kontext ist, und zeigt sonst den Grund.
 *
 * Das ist verkraftbar, weil ein Passkey eine **Ergänzung** ist: Passwort und
 * zweiter Faktor bleiben, und die Anmeldung selbst funktioniert weiterhin ohne
 * JavaScript.
 *
 * Beide Identitäten benutzen dieses Bauteil; sie unterscheiden sich nur im Pfad.
 * Es liegt trotzdem in der Routenschicht und nicht in `src/ui`: Es braucht den
 * Namen der CSRF-Kopfzeile aus der Infrastruktur, und die Anzeigeschicht darf
 * dorthin nicht greifen (NFA-ARCH-01). Dasselbe gilt für `app-shell.tsx`.
 */
export function PasskeyForm({
  endpoint,
  csrfToken,
}: {
  /** `/api/passkeys` oder `/admin/api/passkeys`. */
  readonly endpoint: string;
  readonly csrfToken: string;
}): ReactNode {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function register(): Promise<void> {
    setError(null);
    setBusy(true);

    try {
      const offerResponse = await fetch(endpoint, { headers: { accept: 'application/json' } });
      if (!offerResponse.ok) {
        setError(messages.security.passkeyFailed);
        return;
      }

      const offer = (await offerResponse.json()) as {
        challengeId: string;
        options: Parameters<typeof startRegistration>[0]['optionsJSON'];
      };

      // Hier übernimmt der Browser: Gerätesperre abfragen, Schlüsselpaar
      // erzeugen, signieren. Der private Schlüssel verlässt das Gerät nie.
      const response = await startRegistration({ optionsJSON: offer.options });

      const verifyResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Der CSRF-Token reist als Kopfzeile: Hier geht kein Formular hinaus,
          // und eine fremde Seite kann keine eigene Kopfzeile setzen.
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ challengeId: offer.challengeId, response, label }),
      });

      if (!verifyResponse.ok) {
        setError(messages.security.passkeyFailed);
        return;
      }

      // Neu laden statt den Zustand nachzuführen: Die Liste steht in einer
      // Server-Komponente, und sie ist die Wahrheit.
      window.location.reload();
    } catch {
      // Wer die Gerätesperre abbricht, landet ebenfalls hier — das ist kein
      // Fehler, sondern eine Entscheidung.
      setError(messages.security.passkeyAborted);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error === null ? null : <Alert tone="error">{error}</Alert>}

      <label className="flex flex-col gap-1.5">
        <span className="text-ui font-medium text-ink">{messages.security.passkeyLabel}</span>
        <input
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
          maxLength={80}
          className={INPUT_CLASS}
          aria-describedby="passkey-label-hint"
        />
        <span id="passkey-label-hint" className="text-small text-ink-muted">
          {messages.security.passkeyLabelHint}
        </span>
      </label>

      <div>
        <button
          type="button"
          disabled={busy || label.trim().length === 0}
          onClick={() => {
            void register();
          }}
          className={SECONDARY_BUTTON_CLASS}
        >
          {messages.security.passkeyAdd}
        </button>
      </div>
    </div>
  );
}
