/**
 * Symbole der Oberfläche (Frontend-Entwurf §3, seit M5.8).
 *
 * Alle Symbole stammen aus **einem** Satz (Lucide) und tragen durchgehend
 * dieselbe Strichstärke. Ein zweiter Satz daneben wäre ein Fehler, kein
 * Zeitgewinn: Zwei Strichstärken in einer Liste liest man sofort, ohne
 * benennen zu können, was stört. Deshalb steht die Stärke hier als eine
 * Konstante und nicht als Zahl an fünfzehn Aufrufstellen.
 *
 * Eingefärbt wird nie — die Symbole erben `currentColor` von ihrer
 * Beschriftung. Damit gilt für sie automatisch, was für den Text gilt: Sie
 * kippen mit dem Farbschema und tragen den Zustand des Elements mit.
 *
 * **Ein Symbol ist keine Auskunft.** Wo es allein steht — in Zeilenaktionen —,
 * gehört die Beschriftung in ein `sr-only`-Element daneben; ein Screenreader
 * liest kein Piktogramm. `IconButton` erzwingt das, indem `label` ein
 * Pflichtfeld ist.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { FOCUS_RING } from './form';

/**
 * 1.75 px statt der Lucide-Voreinstellung von 2 px.
 *
 * Bei 16 px Kantenlänge wirken 2 px neben Fira Sans in 400 zu fett; die
 * Symbole zögen mehr Aufmerksamkeit auf sich als die Wörter, neben denen sie
 * stehen. Das wäre genau die Dekoration, gegen die §3 argumentiert.
 */
export const ICON_STROKE = 1.75;

/**
 * Eine Aktion, die nur aus einem Symbol besteht.
 *
 * Vorgesehen für die Zeilenaktionen der Rechnungsliste: In einer Tabellenzeile
 * ist für vier beschriftete Knöpfe kein Platz, und Beschriftungen, die bei
 * jeder Zeile wiederholt werden, sind ohnehin Rauschen. Sichtbar bleibt die
 * Beschriftung im `title`, hörbar im `sr-only`-Text.
 */
export function IconButton({
  icon: Icon,
  label,
  type = 'submit',
  tone = 'quiet',
  disabled,
  formAction,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly type?: 'submit' | 'button';
  readonly tone?: 'quiet' | 'danger';
  readonly disabled?: boolean;
  /**
   * Das Ziel des Absenders — alle Zeilenaktionen liegen in **einem** Formular,
   * verschachtelte Formulare erlaubt HTML nicht.
   *
   * Es gibt hier bewusst **kein** `name`/`value`: React belegt `name` eines
   * absendenden Knopfes selbst, um die Aktionskennung für den Betrieb ohne
   * JavaScript zu übertragen, und überschreibt dabei einen eigenen Namen. Was
   * die Aktion über die Zeile wissen muss, wird an sie gebunden
   * (`action.bind(null, id)`).
   */
  readonly formAction?: (formData: FormData) => void | Promise<void>;
}): ReactNode {
  return (
    <button
      type={type}
      title={label}
      disabled={disabled}
      formAction={formAction}
      className={
        `flex size-8 items-center justify-center rounded-control transition-colors ` +
        `duration-(--duration-state) ${FOCUS_RING} ` +
        (tone === 'danger'
          ? 'text-ink-muted hover:bg-danger-wash hover:text-danger'
          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink') +
        ' disabled:text-ink-faint disabled:hover:bg-transparent'
      }
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={ICON_STROKE} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** Ein Symbol als Zielhilfe neben einer sichtbaren Beschriftung. */
export function Icon({ icon: Glyph }: { readonly icon: LucideIcon }): ReactNode {
  return <Glyph aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />;
}

/**
 * Dasselbe als Verweis.
 *
 * Ein Download ist keine Handlung am Server, sondern ein Ziel — er gehört
 * deshalb in ein `<a>` und nicht in einen Knopf. Als Knopf ausgeführt verlöre
 * er das Kontextmenü, das mittlere Mausrad und die Möglichkeit, ihn in einem
 * neuen Reiter zu öffnen.
 */
export function IconLink({
  icon: Glyph,
  label,
  href,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly href: string;
}): ReactNode {
  return (
    <a
      href={href}
      title={label}
      className={
        `flex size-8 items-center justify-center rounded-control text-ink-muted ` +
        `transition-colors duration-(--duration-state) hover:bg-surface-sunken ` +
        `hover:text-ink ${FOCUS_RING}`
      }
    >
      <Glyph aria-hidden="true" className="size-4" strokeWidth={ICON_STROKE} />
      <span className="sr-only">{label}</span>
    </a>
  );
}
