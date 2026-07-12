import { moneySavedLabel, parseMoneyInput } from '../src/lib/money';

describe('parseMoneyInput', () => {
  it('reads a COMMA as a decimal separator (the 100x bug)', () => {
    // iOS renders decimal-pad with the locale's separator. Stripping the comma
    // turned "12,22" into 1222, which fed baselinePerDay * unitCost, clamped to
    // the $100/day ceiling, and told the user they'd save $36,500 a year.
    expect(parseMoneyInput('12,22')).toBeCloseTo(12.22);
    expect(parseMoneyInput('3,50')).toBeCloseTo(3.5);
    expect(parseMoneyInput('0,99')).toBeCloseTo(0.99);
  });

  it('still reads a DOT as a decimal separator', () => {
    expect(parseMoneyInput('12.22')).toBeCloseTo(12.22);
    expect(parseMoneyInput('0.99')).toBeCloseTo(0.99);
  });

  it('handles both thousands conventions', () => {
    expect(parseMoneyInput('1,234.56')).toBeCloseTo(1234.56); // US
    expect(parseMoneyInput('1.234,56')).toBeCloseTo(1234.56); // EU
  });

  it('treats a lone separator with exactly 3 trailing digits as grouping', () => {
    expect(parseMoneyInput('1,000')).toBe(1000);
    expect(parseMoneyInput('1.000')).toBe(1000);
  });

  it('passes plain integers through untouched', () => {
    expect(parseMoneyInput('12')).toBe(12);
    expect(parseMoneyInput('1222')).toBe(1222);
  });

  it('returns null when there is no number', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('$')).toBeNull();
  });
});

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
