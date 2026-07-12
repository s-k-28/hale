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
