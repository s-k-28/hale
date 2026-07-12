import { haleScore, haleScoreBand, protectedFloor, SCORE_WEIGHTS } from '../src/lib/haleScore';

const at = (
  recoveryFraction: number,
  currentStreak: number,
  longestStreak: number,
  lifetimeMoneySaved: number,
) => ({ recoveryFraction, currentStreak, longestStreak, lifetimeMoneySaved });

describe('haleScore', () => {
  it('never reads 0 for someone with an active quit (day one still shows up)', () => {
    const day0 = haleScore(at(0, 0, 0, 0));
    expect(day0).toBe(SCORE_WEIGHTS.showingUp); // 10, not 0
    expect(day0).toBeGreaterThan(0);
  });

  it('grows monotonically through a clean run', () => {
    const d1 = haleScore(at(0.02, 1, 1, 8));
    const d7 = haleScore(at(0.15, 7, 7, 55));
    const d30 = haleScore(at(0.4, 30, 30, 235));
    const d90 = haleScore(at(0.7, 90, 90, 700));
    expect(d1).toBeLessThan(d7);
    expect(d7).toBeLessThan(d30);
    expect(d30).toBeLessThan(d90);
    expect(d90).toBeGreaterThan(80);
  });

  it('THE POINT: a relapse dents the score but never zeroes it', () => {
    const before = haleScore(at(0.4, 30, 30, 235)); // 30 clean days
    // Relapse: body recovery and current streak reset. Best run + money banked survive.
    const after = haleScore(at(0, 0, 30, 235));

    expect(after).toBeLessThan(before); // it hurts...
    expect(after).toBeGreaterThan(0); // ...but it is NOT zero
    expect(after).toBeGreaterThanOrEqual(SCORE_WEIGHTS.showingUp);
    // And what survives is exactly the protected floor.
    expect(after).toBe(protectedFloor(at(0, 0, 30, 235)));
  });

  it('the protected floor rises with history, so a veteran never crashes to a beginner', () => {
    const rookieAfterSlip = haleScore(at(0, 0, 3, 20));
    const veteranAfterSlip = haleScore(at(0, 0, 120, 1200));
    expect(veteranAfterSlip).toBeGreaterThan(rookieAfterSlip);
  });

  it('clamps to 0-100 and tolerates junk input', () => {
    expect(haleScore(at(5, 9999, 9999, 1e9))).toBeLessThanOrEqual(100);
    expect(haleScore(at(-1, -5, -5, -5))).toBeGreaterThanOrEqual(0);
    expect(haleScore(at(NaN, 0, 0, 0))).toBe(SCORE_WEIGHTS.showingUp);
  });

  it('longest streak is never reported below the current one', () => {
    // A stale longestStreak must not drag the score below reality.
    expect(haleScore(at(0.4, 30, 0, 235))).toBe(haleScore(at(0.4, 30, 30, 235)));
  });

  it('bands read sensibly across the run', () => {
    expect(haleScoreBand(haleScore(at(0, 0, 0, 0)))).toBe('Finding your feet');
    expect(haleScoreBand(90)).toBe('Unshakeable');
    expect(haleScoreBand(60)).toBe('Strong');
    expect(haleScoreBand(30)).toBe('Building');
  });
});
