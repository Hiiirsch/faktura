/**
 * Ländercodes nach ISO 3166-1 alpha-2 (FA-KUND-03, Spec §9.2). Klartext-
 * Ländernamen werden nie gespeichert.
 *
 * Die Mitgliedsliste der EU wird ab M3 für die Ermittlung der Steuerkategorie
 * gebraucht (Reverse Charge gegenüber Drittland).
 */

/** Offizielle ISO-3166-1-alpha-2-Codes, Stand 2026. */
const ISO_3166_1_ALPHA_2 =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
  'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
  'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
  'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
  'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
  'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

export const COUNTRY_CODES: readonly string[] = Object.freeze(ISO_3166_1_ALPHA_2.split(' '));

const COUNTRY_CODE_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);

export type CountryCode = string & { readonly __countryCode: true };

export const DEFAULT_COUNTRY_CODE = 'DE' as CountryCode;

export function isCountryCode(value: string): value is CountryCode {
  return COUNTRY_CODE_SET.has(value);
}

/** Mitgliedstaaten der Europäischen Union, Stand 2026 (27 Staaten). */
const EU_MEMBER_STATES: ReadonlySet<string> = new Set(
  ('AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK').split(' '),
);

export function isEuMemberState(code: CountryCode): boolean {
  return EU_MEMBER_STATES.has(code);
}
