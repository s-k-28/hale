import { moneySavedLabel } from '../src/lib/money';

describe('moneySavedLabel', () => {
  it('keeps cents under $10 so a day-one quitter never sees "$0"', () => {
    // The bug this guards: the shareable card used Math.round, so 41 minutes in
    // it rendered "$0" on the very artifact the user posts publicly.
    expect(moneySavedLabel(0.53)).toBe('$0.53');
    expect(moneySavedLabel(0.04)).toBe('$0.04');
    expect(moneySavedLabel(9.99)).toBe('$9.99');
  });

  it('drops cents at $10+ where they are noise', () => {
    expect(moneySavedLabel(10)).toBe('$10');
    expect(moneySavedLabel(1240.37)).toBe('$1,240');
  });

  it('agrees across screens for the same input', () => {
    // Today's tile and the share card previously disagreed ($0.53 vs $1) because
    // each had its own formatter. One function, one answer.
    const v = 0.53;
    expect(moneySavedLabel(v)).toBe(moneySavedLabel(v));
    expect(moneySavedLabel(v)).not.toBe('$1');
  });

  it('never renders a negative or non-finite amount', () => {
    expect(moneySavedLabel(-5)).toBe('$0.00');
    expect(moneySavedLabel(NaN)).toBe('$0.00');
    expect(moneySavedLabel(Infinity)).toBe('$0.00');
  });
});
