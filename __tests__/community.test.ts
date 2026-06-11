import {
  HANDLE_ADJECTIVES,
  HANDLE_ANIMALS,
  generateHandle,
  generateAvatarSeed,
} from '../convex/model/anonHandles';
import {
  POST_MAX_CHARS,
  RATE_LIMIT_MAX_POSTS,
  RATE_LIMIT_WINDOW_MS,
  canPostAgain,
  coarseTimeLabel,
  validatePostBody,
  moderationOutcome,
} from '../convex/model/communityRules';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// Tiny deterministic LCG so handle generation is reproducible in tests — the
// production caller injects Math.random; the contract only requires rand() in [0,1).
const seededRand = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

describe('generateHandle', () => {
  it('produces adjective-animal-N with words from the lists and N in 1..99', () => {
    const rand = seededRand(42);
    for (let i = 0; i < 200; i++) {
      const handle = generateHandle(rand);
      const parts = handle.split('-');
      expect(parts).toHaveLength(3);
      const [adjective, animal, number] = parts;
      expect(HANDLE_ADJECTIVES).toContain(adjective);
      expect(HANDLE_ANIMALS).toContain(animal);
      const n = Number(number);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99);
    }
  });

  it('is deterministic given the same seeded rand stream', () => {
    expect(generateHandle(seededRand(7))).toBe(generateHandle(seededRand(7)));
    expect(generateHandle(seededRand(123456))).toBe(generateHandle(seededRand(123456)));
  });

  it('picks the first words and lowest number when rand always returns 0', () => {
    expect(generateHandle(() => 0)).toBe(`${HANDLE_ADJECTIVES[0]}-${HANDLE_ANIMALS[0]}-1`);
  });

  it('never overruns the lists or 99 as rand approaches 1', () => {
    // floor(0.9999999 * len) must stay a valid index; 1 + floor(rand*99) caps at 99.
    const handle = generateHandle(() => 0.9999999);
    const [adjective, animal, number] = handle.split('-');
    expect(adjective).toBe(HANDLE_ADJECTIVES[HANDLE_ADJECTIVES.length - 1]);
    expect(animal).toBe(HANDLE_ANIMALS[HANDLE_ANIMALS.length - 1]);
    expect(Number(number)).toBe(99);
  });

  it('produces distinct handles across distinct rand streams', () => {
    // Collisions are possible by design (the caller retries against the index),
    // but across 100 independent streams the space (~228k) should look diverse.
    const handles = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) handles.add(generateHandle(seededRand(seed)));
    expect(handles.size).toBeGreaterThan(95);
  });

  it('word lists are non-trivially sized, lowercase single words, no duplicates', () => {
    for (const list of [HANDLE_ADJECTIVES, HANDLE_ANIMALS]) {
      expect(list.length).toBeGreaterThanOrEqual(48);
      expect(new Set(list).size).toBe(list.length);
      for (const word of list) expect(word).toMatch(/^[a-z]+$/);
    }
  });
});

describe('generateAvatarSeed', () => {
  it('is always 6 lowercase hex chars, padded when small', () => {
    expect(generateAvatarSeed(() => 0)).toBe('000000');
    const rand = seededRand(9);
    for (let i = 0; i < 100; i++) {
      expect(generateAvatarSeed(rand)).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it('is deterministic given the same seeded rand stream', () => {
    expect(generateAvatarSeed(seededRand(3))).toBe(generateAvatarSeed(seededRand(3)));
  });
});

describe('canPostAgain (3 posts per rolling hour)', () => {
  const now = 1_750_000_000_000;

  it('allows posting under the limit', () => {
    expect(canPostAgain([], now)).toEqual({ allowed: true });
    expect(canPostAgain([now - MS_PER_MINUTE], now)).toEqual({ allowed: true });
    expect(canPostAgain([now - MS_PER_MINUTE, now - 2 * MS_PER_MINUTE], now)).toEqual({
      allowed: true,
    });
  });

  it('blocks the limit-th post in the window with retryAtMs = oldest + window', () => {
    const oldest = now - 50 * MS_PER_MINUTE;
    const times = [now - 5 * MS_PER_MINUTE, oldest, now - 20 * MS_PER_MINUTE]; // any order
    expect(times).toHaveLength(RATE_LIMIT_MAX_POSTS);
    const result = canPostAgain(times, now);
    expect(result.allowed).toBe(false);
    // Reopens the moment the OLDEST in-window post ages out (10 min from now).
    expect(result.retryAtMs).toBe(oldest + RATE_LIMIT_WINDOW_MS);
  });

  it('old posts age out of the rolling hour', () => {
    // Two posts well outside the window plus two inside → still allowed.
    const times = [
      now - 2 * MS_PER_HOUR,
      now - 61 * MS_PER_MINUTE,
      now - 10 * MS_PER_MINUTE,
      now - MS_PER_MINUTE,
    ];
    expect(canPostAgain(times, now)).toEqual({ allowed: true });
  });

  it('boundary: a post exactly one window old has aged out; one ms newer has not', () => {
    const recent = [now - MS_PER_MINUTE, now - 2 * MS_PER_MINUTE];
    // Window is (now - WINDOW, now]: exactly-now-minus-an-hour is OUT...
    expect(canPostAgain([...recent, now - RATE_LIMIT_WINDOW_MS], now).allowed).toBe(true);
    // ...but one millisecond inside still counts and blocks.
    const blocked = canPostAgain([...recent, now - RATE_LIMIT_WINDOW_MS + 1], now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAtMs).toBe(now + 1);
  });

  it('a post stamped exactly at now counts against the limit', () => {
    const result = canPostAgain([now, now - MS_PER_MINUTE, now - 2 * MS_PER_MINUTE], now);
    expect(result.allowed).toBe(false);
  });
});

describe('moderationOutcome', () => {
  // Exhaustive: all 16 flag combinations. Contract: pii || glamorizing ||
  // harassment → 'shadowed' EVEN when crisis is also true (the author still
  // gets the crisis card — crisis passes through as-is, always).
  const bools = [false, true];
  for (const pii of bools) {
    for (const crisis of bools) {
      for (const glamorizing of bools) {
        for (const harassment of bools) {
          const flags = { pii, crisis, glamorizing, harassment };
          const expectedStatus = pii || glamorizing || harassment ? 'shadowed' : 'published';
          it(`${JSON.stringify(flags)} → ${expectedStatus}, crisis=${crisis}`, () => {
            expect(moderationOutcome(flags)).toEqual({ status: expectedStatus, crisis });
          });
        }
      }
    }
  }

  it('crisis alone publishes — never shadow someone for reaching out', () => {
    expect(
      moderationOutcome({ pii: false, crisis: true, glamorizing: false, harassment: false }),
    ).toEqual({ status: 'published', crisis: true });
  });

  it('a shadowed crisis post still reports crisis=true (the author keeps the card)', () => {
    expect(
      moderationOutcome({ pii: true, crisis: true, glamorizing: false, harassment: false }),
    ).toEqual({ status: 'shadowed', crisis: true });
  });
});

describe('coarseTimeLabel', () => {
  const now = 1_750_000_000_000;

  it('< 60s is "just now"', () => {
    expect(coarseTimeLabel(now, now)).toBe('just now');
    expect(coarseTimeLabel(now - 59_999, now)).toBe('just now');
  });

  it('clamps negative deltas (clock skew) to "just now"', () => {
    expect(coarseTimeLabel(now + 5 * MS_PER_MINUTE, now)).toBe('just now');
  });

  it('minutes bucket: 60s up to an hour', () => {
    expect(coarseTimeLabel(now - MS_PER_MINUTE, now)).toBe('1m ago');
    expect(coarseTimeLabel(now - 90_000, now)).toBe('1m ago'); // floors, never rounds up
    expect(coarseTimeLabel(now - 59 * MS_PER_MINUTE, now)).toBe('59m ago');
  });

  it('hours bucket: an hour up to a day', () => {
    expect(coarseTimeLabel(now - MS_PER_HOUR, now)).toBe('1h ago');
    expect(coarseTimeLabel(now - 23 * MS_PER_HOUR, now)).toBe('23h ago');
  });

  it('days bucket: a day up to a week', () => {
    expect(coarseTimeLabel(now - MS_PER_DAY, now)).toBe('1d ago');
    expect(coarseTimeLabel(now - 6 * MS_PER_DAY, now)).toBe('6d ago');
  });

  it('weeks bucket: a week and beyond', () => {
    expect(coarseTimeLabel(now - 7 * MS_PER_DAY, now)).toBe('1w ago');
    expect(coarseTimeLabel(now - 30 * MS_PER_DAY, now)).toBe('4w ago');
  });

  it('boundary exactness at each bucket edge', () => {
    expect(coarseTimeLabel(now - 60_000 + 1, now)).toBe('just now');
    expect(coarseTimeLabel(now - 60_000, now)).toBe('1m ago');
    expect(coarseTimeLabel(now - MS_PER_HOUR + 1, now)).toBe('59m ago');
    expect(coarseTimeLabel(now - MS_PER_HOUR, now)).toBe('1h ago');
    expect(coarseTimeLabel(now - MS_PER_DAY + 1, now)).toBe('23h ago');
    expect(coarseTimeLabel(now - MS_PER_DAY, now)).toBe('1d ago');
    expect(coarseTimeLabel(now - 7 * MS_PER_DAY + 1, now)).toBe('6d ago');
    expect(coarseTimeLabel(now - 7 * MS_PER_DAY, now)).toBe('1w ago');
  });
});

describe('validatePostBody', () => {
  it('rejects an empty body', () => {
    expect(validatePostBody('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('whitespace-only input is rejected once trimmed at the call site', () => {
    // Contract: validatePostBody receives the TRIMMED body (createPost calls
    // validatePostBody(body.trim())) — so whitespace-only collapses to empty.
    expect(validatePostBody('   \n\t  '.trim())).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts a normal body and the exact 500-char boundary', () => {
    expect(validatePostBody('day 3, craving like crazy but still here')).toEqual({ ok: true });
    expect(validatePostBody('a'.repeat(POST_MAX_CHARS))).toEqual({ ok: true });
  });

  it('rejects 501 chars as too_long', () => {
    expect(validatePostBody('a'.repeat(POST_MAX_CHARS + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });
});
