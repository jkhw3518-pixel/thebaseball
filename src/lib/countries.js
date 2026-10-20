// ISO 3166-1 alpha-2 전체 + 코소보(XK). 국가명은 브라우저 Intl API로 한국어/영어 표시.
const CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS
MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS
RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW
TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(/\s+/);

const FALLBACK_NAMES = { XK: 'Kosovo' };

function makeNamer(locale) {
  try {
    const dn = new Intl.DisplayNames([locale], { type: 'region' });
    return (code) => {
      try { return dn.of(code) || FALLBACK_NAMES[code] || code; } catch { return FALLBACK_NAMES[code] || code; }
    };
  } catch {
    return (code) => FALLBACK_NAMES[code] || code;
  }
}

const koName = makeNamer('ko');
const enName = makeNamer('en');

export function flagOf(code) {
  if (!code || code.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const COUNTRIES = CODES.map((code) => ({
  code,
  ko: koName(code),
  en: enName(code),
  flag: flagOf(code),
})).sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryName(code) {
  return byCode.get(code)?.ko ?? code;
}

export function countryLabel(code) {
  const c = byCode.get(code);
  return c ? `${c.flag} ${c.ko}` : code;
}
