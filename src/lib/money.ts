/**
 * The ONE formatter for the "money saved" metric.
 *
 * This exists because the same number rendered three different ways: Today's
 * tile forced 2 decimals ("$0.53"), while the shareable TransformationCard
 * rounded to whole dollars ("$1") — so a user 41 minutes in saw $0.53 on one
 * screen and $1 on the next. The share card was the worse offender: rounding
 * meant anything under 50c rendered as "$0" on the artifact people post
 * publicly, which reads as "this app did nothing for me".
 *
 * The rule is scale-aware, because both halves matter for different reasons:
 *   - Under $10, cents ARE the number. Day one is the whole game, and "$0.53"
 *     is proof the counter is alive in a way "$1" (or "$0") is not.
 *   - At $10+, cents are noise. "$1,240" reads instantly; "$1,240.37" does not,
 *     and the trailing cents shrink the digits on the share card.
 *
 * Prices (paywall, "$29.99/yr") are NOT this. They are exact to the cent by
 * law and by convention — see the formatters in src/app/paywall.tsx. Do not
 * route them through here.
 */
export function moneySavedLabel(n: number): string {
  const v = Math.max(0, Number.isFinite(n) ? n : 0);
  const decimals = v < 10 ? 2 : 0;
  return `$${v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Parse a user-typed money amount. Returns null if there is no valid number.
 *
 * This exists because `text.replace(/[^0-9.]/g, '')` — the obvious thing, and
 * what both money inputs used to do — is a 100x bug outside the US. iOS renders
 * `keyboardType="decimal-pad"` with the LOCALE's decimal separator, and most of
 * Europe and Latin America use a COMMA. So a user typing "12,22" had the comma
 * silently deleted and got 1222.
 *
 * That number then fed baselinePerDay * unitCost, which MAX_DAILY_SPEND clamped
 * to $100/day — so instead of failing loudly it quietly told that user they were
 * about to save $36,500 a year, and anchored the paywall on it.
 *
 * Both separators are therefore accepted. The only genuine ambiguity is a single
 * separator followed by exactly three digits ("1,000" / "1.000"), which is far
 * more likely a thousands group than a three-decimal price, so we read it that
 * way. Everything else is unambiguous once you take the LAST separator as the
 * decimal point and treat any earlier ones as grouping:
 *
 *   "12,22"    -> 12.22      "12.22"     -> 12.22
 *   "1,234.56" -> 1234.56    "1.234,56"  -> 1234.56
 *   "1,000"    -> 1000       "1.000"     -> 1000
 */
export function parseMoneyInput(text: string): number | null {
  const cleaned = (text ?? '').replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;

  const lastSep = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  let normalized: string;

  if (lastSep === -1) {
    normalized = cleaned;
  } else {
    const decimals = cleaned.slice(lastSep + 1);
    const separators = (cleaned.match(/[.,]/g) ?? []).length;
    // A lone separator with exactly 3 trailing digits is a thousands group.
    const isGrouping = separators === 1 && decimals.length === 3;
    normalized = isGrouping
      ? cleaned.replace(/[.,]/g, '')
      : `${cleaned.slice(0, lastSep).replace(/[.,]/g, '')}.${decimals.replace(/[.,]/g, '')}`;
  }

  const n = parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
