/**
 * PURE pseudonym helpers for the anonymous community. Handles look like
 * "steady-otter-47" — warm, never clinical, and carry zero user linkage.
 * Deterministic given an injected rand source ([0,1)) so they're unit-testable;
 * callers pass Math.random (Convex's seeded RNG — fine in mutations).
 *
 * Capacity ≈ 48 × 48 × 99 ≈ 228k handles per group, so collisions are rare;
 * the caller (ensureAnonProfile) checks the per-group handle index and retries.
 */

export const HANDLE_ADJECTIVES: string[] = [
  'steady', 'quiet', 'brave', 'calm', 'bright', 'patient', 'bold', 'gentle',
  'mellow', 'keen', 'sturdy', 'honest', 'plucky', 'sunny', 'solid', 'swift',
  'easy', 'clear', 'warm', 'spry', 'hardy', 'vivid', 'wry', 'noble',
  'tidy', 'lucky', 'crisp', 'daring', 'earnest', 'fresh', 'humble', 'jolly',
  'kind', 'lively', 'merry', 'nimble', 'peppy', 'quick', 'rosy', 'sage',
  'tough', 'upbeat', 'valiant', 'wise', 'zesty', 'ready', 'stout', 'true',
];

export const HANDLE_ANIMALS: string[] = [
  'otter', 'heron', 'badger', 'lynx', 'wren', 'elk', 'fox', 'hare',
  'ibis', 'jay', 'koala', 'lemur', 'marten', 'newt', 'osprey', 'puffin',
  'quail', 'raven', 'seal', 'tern', 'urchin', 'vole', 'walrus', 'yak',
  'zebra', 'bison', 'crane', 'dingo', 'egret', 'finch', 'gecko', 'hawk',
  'iguana', 'kestrel', 'loon', 'moose', 'narwhal', 'ocelot', 'pika', 'robin',
  'stork', 'tapir', 'umber', 'viper', 'wombat', 'falcon', 'beaver', 'dove',
];

/** Deterministic pick from a seeded rand in [0,1). "adjective-animal-N", N in 1..99. */
export function generateHandle(rand: () => number): string {
  const adjective = HANDLE_ADJECTIVES[Math.floor(rand() * HANDLE_ADJECTIVES.length)];
  const animal = HANDLE_ANIMALS[Math.floor(rand() * HANDLE_ANIMALS.length)];
  const number = 1 + Math.floor(rand() * 99);
  return `${adjective}-${animal}-${number}`;
}

/** 6-char lowercase hex seed for the deterministic avatar hue. */
export function generateAvatarSeed(rand: () => number): string {
  return Math.floor(rand() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
}

/**
 * STABLE pseudonym for a user id — the same id always yields the same
 * "swift-otter-12". Used where a peer's identity is shown to STRANGERS (the
 * leagues leaderboard) so we never leak a real first name (App Store 1.2 /
 * privacy). Unlike the per-group anonProfiles handles, this needs no DB row and
 * works for users who never opened the community. Fully deterministic (seeded
 * from the id, no Math.random) so it is safe to call inside a Convex query.
 */
export function handleForUser(userId: string): string {
  // xfnv1a hash of the id → 32-bit seed.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < userId.length; i++) {
    h = Math.imul(h ^ userId.charCodeAt(i), 16777619);
  }
  // mulberry32 PRNG as the rand source for generateHandle's three draws.
  let a = h >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return generateHandle(rand);
}
