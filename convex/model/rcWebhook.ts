/**
 * RevenueCat webhook → users.premium mirror mapping (pure, unit-tested).
 *
 * The RC SDK entitlement is the RUNTIME source of truth for gating; the mirror
 * only feeds server-side gates (Sage caps, squads) + segmentation. So the
 * mapping is deliberately conservative: ambiguous events are IGNORED, never
 * guessed — a stale-true mirror self-corrects on the next RENEWAL/EXPIRATION,
 * but a wrong revoke locks a paying user out of server-gated features.
 *
 * The two bugs this replaces (previously `!['CANCELLATION','EXPIRATION']`):
 *   • CANCELLATION ⇒ revoke — WRONG for the common case. CANCELLATION means
 *     auto-renew was turned OFF; access continues until period end (EXPIRATION
 *     fires then). Revoking here strips HALE+ from a user who paid for the
 *     remaining period. The exception: cancel_reason CUSTOMER_SUPPORT is a
 *     refund — access IS revoked immediately, so that one still revokes.
 *   • every-other-event ⇒ grant — WRONG. TEST, BILLING_ISSUE, TRANSFER,
 *     SUBSCRIBER_ALIAS etc. all minted premium=true for whatever id they named.
 *
 * TRANSFER moves an entitlement between app_user_ids (e.g. restore on a fresh
 * anonymous install): revoke every transferred_from id, grant every
 * transferred_to id — otherwise the restored account would read free
 * server-side until its next billing event.
 */

/** Events that mean the entitlement is (still) active for event.app_user_id. */
const GRANT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

export type RcEvent = {
  type?: string;
  app_user_id?: string;
  cancel_reason?: string;
  transferred_from?: string[];
  transferred_to?: string[];
};

export type PremiumChange = { externalId: string; premium: boolean };

/**
 * The list of (externalId, premium) mirror writes a webhook event implies.
 * Empty for ignored/ambiguous events (CANCELLATION w/o refund, BILLING_ISSUE,
 * SUBSCRIPTION_PAUSED — access runs to period end and EXPIRATION will fire,
 * TEST, unknown future types).
 */
export function premiumChangesFor(event: RcEvent | null | undefined): PremiumChange[] {
  const type = event?.type;
  if (!type) return [];

  if (type === 'TRANSFER') {
    const from = Array.isArray(event?.transferred_from) ? event.transferred_from : [];
    const to = Array.isArray(event?.transferred_to) ? event.transferred_to : [];
    return [
      ...from.map((externalId) => ({ externalId, premium: false })),
      ...to.map((externalId) => ({ externalId, premium: true })),
    ];
  }

  const appUserId = event?.app_user_id;
  if (!appUserId) return [];

  if (GRANT_TYPES.has(type)) return [{ externalId: appUserId, premium: true }];

  // Refund (immediate revoke) vs plain auto-renew-off (keep access; ignore).
  const isRefund = type === 'CANCELLATION' && event?.cancel_reason === 'CUSTOMER_SUPPORT';
  if (type === 'EXPIRATION' || isRefund) return [{ externalId: appUserId, premium: false }];

  return [];
}
