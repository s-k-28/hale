/**
 * Buddy pairing invariants (pure, unit-tested — same pattern as model/trial.ts).
 *
 * HALE's buddy model is ONE active buddy per user at a time (decision 2026-06-10):
 * `myBuddy` returns a single link, nudges/feed gate on "the caller's active
 * buddy", and the squad tab renders one paired block — multiple concurrent
 * active links would make all of those nondeterministic. `pairGate` is the one
 * place that invariant is decided; buddies.pairWith enforces it server-side
 * (the mutation is callable directly, so a client-side check is not enough).
 *
 * Idempotency is preserved: re-pairing the SAME pair (matching pairKey) is
 * allowed through — pairWith's existing-link branch reports `alreadyPaired`
 * instead of throwing. Ended links don't block: an unpaired user's
 * findActiveLink is null, so they can re-pair freely (with anyone).
 */

/** Deterministic key for an unordered pair: sorted ids joined with "_". */
export function pairKeyFor(a: string, b: string): string {
  return [a, b].sort().join('_');
}

export type PairGateVerdict = 'ok' | 'caller_already_paired' | 'inviter_already_paired';

/**
 * May this (caller, inviter) pairing proceed? Inputs are the pairKeys of each
 * side's CURRENT active link (null when unpaired) and the key of the proposed
 * pair. Checked on BOTH sides: a caller with a different active buddy may not
 * take a second, and an inviter with a different active buddy may not be taken
 * as one — otherwise accepting a stale invite link would silently give the
 * inviter a second buddy their own UI never shows.
 */
export function pairGate(
  callerActivePairKey: string | null,
  inviterActivePairKey: string | null,
  proposedPairKey: string,
): PairGateVerdict {
  if (callerActivePairKey !== null && callerActivePairKey !== proposedPairKey) {
    return 'caller_already_paired';
  }
  if (inviterActivePairKey !== null && inviterActivePairKey !== proposedPairKey) {
    return 'inviter_already_paired';
  }
  return 'ok';
}
