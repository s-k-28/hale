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
