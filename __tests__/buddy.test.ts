import { pairGate, pairKeyFor } from '../convex/model/buddy';

const A = 'userA1';
const B = 'userB2';
const C = 'userC3';

describe('pairKeyFor', () => {
  it('is order-independent (symmetric-safe pairing)', () => {
    expect(pairKeyFor(A, B)).toBe(pairKeyFor(B, A));
  });

  it('distinguishes different pairs', () => {
    expect(pairKeyFor(A, B)).not.toBe(pairKeyFor(A, C));
  });
});

describe('pairGate — one active buddy at a time', () => {
  const AB = pairKeyFor(A, B);
  const AC = pairKeyFor(A, C);
  const BC = pairKeyFor(B, C);

  it('allows pairing when neither side has an active buddy', () => {
    expect(pairGate(null, null, AB)).toBe('ok');
  });

  it('allows the idempotent re-pair of the SAME pair (alreadyPaired path)', () => {
    expect(pairGate(AB, AB, AB)).toBe('ok');
  });

  it('rejects a caller who already has a DIFFERENT active buddy', () => {
    // A (active with C) tries to pair with B.
    expect(pairGate(AC, null, AB)).toBe('caller_already_paired');
  });

  it('rejects when the inviter already has a DIFFERENT active buddy', () => {
    // A (free) accepts B's stale invite link, but B is active with C.
    expect(pairGate(null, BC, AB)).toBe('inviter_already_paired');
  });

  it('caller-side check wins when both sides are otherwise-paired', () => {
    expect(pairGate(AC, BC, AB)).toBe('caller_already_paired');
  });

  it('an unpaired (ended-link) user can re-pair — null means no ACTIVE link', () => {
    // After unpair, findActiveLink returns null; ended rows never block.
    expect(pairGate(null, null, AC)).toBe('ok');
    expect(pairGate(null, null, AB)).toBe('ok');
  });
});

describe('pairGate — referral completion is only reachable on allowed pairs', () => {
  // completeReferralForPair runs strictly AFTER the gate inside pairWith. These
  // lock the gate verdicts that decide whether a referral can complete:
  it('fresh invitee + free referrer → ok, so the referral can complete', () => {
    expect(pairGate(null, null, pairKeyFor('invitee', 'referrer'))).toBe('ok');
  });

  it('fresh invitee + referrer already paired → rejected, row stays attributed', () => {
    expect(
      pairGate(null, pairKeyFor('referrer', 'other'), pairKeyFor('invitee', 'referrer')),
    ).toBe('inviter_already_paired');
  });
});
