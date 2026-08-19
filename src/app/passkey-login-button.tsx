'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/i18n/de';
import { CSRF_HEADER_NAME } from '@/infrastructure/security/csrf';
import { Alert, SECONDARY_BUTTON_CLASS } from '@/ui/components/form';

/**
 * Anmelden mit einem Passkey (M9, FA-PASS-06).
 *
 * **Eine Ergänzung, kein Ersatz.** WebAuthn ist eine Browser-API; ohne
 * JavaScript gibt es keine Zeremonie. Dieser Knopf erscheint dann schlicht
 * nicht, und das Anmeldeformular daneben bleibt, wie es war — es ist eine
 * Server-Komponente mit einfacher Server Action und funktioniert ohne
 * JavaScript. Genau deshalb steht der Passkey-Weg **neben** dem Formular und
 * nicht an seiner Stelle.
 *
 * Beide Identitäten benutzen dasselbe Bauteil; sie unterscheiden sich im Pfad
 * und im Ziel nach erfolgreicher Anmeldung.
 */
export function PasskeyLoginButton({
  endpoint,
  redirectTo,
  csrfToken,
}: {
  /** `/api/passkeys/login` oder `/admin/api/passkeys/login`. */
  readonly endpoint: string;
  readonly redirectTo: string;
  readonly csrfToken: string;
}): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(): Promise<void> {
    setError(null);
    setBusy(true);

    try {
      const offerResponse = await fetch(endpoint, { headers: { accept: 'application/json' } });
      if (!offerResponse.ok) {
        setError(messages.login.passkeyFailed);
        return;
      }

      const offer = (await offerResponse.json()) as {
        challengeId: string;
        options: { challenge: string; rpId: string; timeout: number };
      };

      /*
       * Ohne `allowCredentials`: Der Passkey ist auffindbar, also bietet der
       * Browser die passenden von selbst an und nennt anschließend, zu wem der
       * gewählte gehört. Wer sich anmeldet, tippt nichts.
       */
      const response = await startAuthentication({
        optionsJSON: {
          challenge: offer.options.challenge,
          rpId: offer.options.rpId,
          timeout: offer.options.timeout,
          userVerification: 'required',
        },
      });

      const verifyResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ challengeId: offer.challengeId, response }),
      });

      if (!verifyResponse.ok) {
        // Eine Antwort für alles: unbekannter Schlüssel, gesperrtes Konto,
        // stillgelegtes Unternehmen. Der Grund steht im Serverlog.
        setError(messages.login.passkeyRejected);
        return;
      }

      window.location.assign(redirectTo);
    } catch {
      // Wer die Gerätesperre abbricht, landet ebenfalls hier — das ist kein
      // Fehler, sondern eine Entscheidung.
      setError(messages.login.passkeyAborted);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error === null ? null : <Alert tone="error">{error}</Alert>}

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void signIn();
        }}
        className={SECONDARY_BUTTON_CLASS}
      >
        {messages.login.passkeySubmit}
      </button>
    </div>
  );
}
