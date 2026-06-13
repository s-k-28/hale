import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The HALE haptic vocabulary — the ONE place that talks to the iOS Taptic
 * Engine (the only file in the app allowed to import expo-haptics). Screens and
 * primitives speak in semantics (select/press/success/breath…), never in raw
 * impact styles, so the *feel* of the app stays consistent and tunable from
 * here.
 *
 * Two ownership rules keep the vocabulary from double-firing:
 *   1. INTERACTIONS are owned by the UI primitives. A Button/Chip/OptRow/IconBtn
 *      fires its own press-in haptic; call sites must NOT add one on top.
 *   2. OUTCOMES are owned by the call site. success/warn/error/celebrate/breath
 *      describe what *happened* (a save landed, a milestone hit, a phase of a
 *      breathing exercise) — the primitive can't know that, so the screen fires it.
 *
 * The anti-shame rule: relapse, slip, and reset-the-counter flows NEVER use
 * error() or warn(). A slip is not a failure the device should scold — those
 * moments stay silent or use a soft/neutral beat. error/warn are for the
 * *system* failing the user (a network save dropped), never the user "failing".
 *
 * Everything here is fire-and-forget: haptics are a garnish, never on the
 * critical path, so we swallow rejections and never await. Each method is gated
 * by the user preference AND by iOS — this is an iOS app; on any other platform
 * every method is a silent no-op.
 */

const KEY = 'hale:hapticsEnabled'

// In-memory source of truth (mirrored to AsyncStorage). DEFAULT-ON: a fresh
// install has no stored value, so haptics are on until the user opts out.
let enabled = true

// Only fire when the user hasn't disabled them AND we're on the Taptic Engine.
function on(): boolean {
  return enabled && Platform.OS === 'ios'
}

/**
 * Hydrate `enabled` from storage. Called once at the root layout so haptics
 * reflect the saved preference from the very first interaction. DEFAULT-ON:
 * only a literal stored 'false' disables — missing or any other value = on.
 */
export async function initHaptics(): Promise<void> {
  try {
    enabled = (await AsyncStorage.getItem(KEY)) !== 'false'
  } catch {
    // Storage failure → keep the default-on in-memory value.
  }
}

/**
 * Flip the preference and persist it. The in-memory flag takes effect
 * immediately (the next haptic respects it); the write is fire-and-forget.
 */
export function setHapticsEnabled(value: boolean): void {
  enabled = value
  void AsyncStorage.setItem(KEY, value ? 'true' : 'false').catch(() => {})
}

/** Current in-memory preference — for the Settings switch's controlled value. */
export function getHapticsEnabled(): boolean {
  return enabled
}

const I = Haptics.ImpactFeedbackStyle
const N = Haptics.NotificationFeedbackType

/**
 * The semantic vocabulary. Every method is fire-and-forget and guarded — call
 * freely, it self-suppresses when disabled or off-platform.
 */
export const haptics = {
  /** Selection tick — pickers, chips, toggles, tab switches, step advances. */
  select() {
    if (on()) void Haptics.selectionAsync().catch(() => {})
  },
  /** Light impact — secondary/ghost buttons, list rows, dismissals. */
  tap() {
    if (on()) void Haptics.impactAsync(I.Light).catch(() => {})
  },
  /** Medium impact — primary CTAs (THE action on a screen). */
  press() {
    if (on()) void Haptics.impactAsync(I.Medium).catch(() => {})
  },
  /** Heavy impact — SOS entry, the quit-commit moment. Weighty, deliberate. */
  heavy() {
    if (on()) void Haptics.impactAsync(I.Heavy).catch(() => {})
  },
  /** Soft impact — ambient beats (minute ticks, reply arrival). */
  soft() {
    if (on()) void Haptics.impactAsync(I.Soft).catch(() => {})
  },
  /** Rigid impact — reserved for sharp, mechanical feedback. */
  rigid() {
    if (on()) void Haptics.impactAsync(I.Rigid).catch(() => {})
  },
  /** Success notification — an outcome landed well. */
  success() {
    if (on()) void Haptics.notificationAsync(N.Success).catch(() => {})
  },
  /** Warning notification — the SYSTEM warns the user. Never for a slip. */
  warn() {
    if (on()) void Haptics.notificationAsync(N.Warning).catch(() => {})
  },
  /** Error notification — the SYSTEM failed the user. Never for a relapse. */
  error() {
    if (on()) void Haptics.notificationAsync(N.Error).catch(() => {})
  },
  /**
   * Breathing-exercise beat: a Soft pulse on the inhale, a Light pulse on the
   * exhale. The hold phases are silent by design — stillness is the point.
   */
  breath(dir: 'in' | 'out') {
    if (on()) void Haptics.impactAsync(dir === 'in' ? I.Soft : I.Light).catch(() => {})
  },
  /**
   * The milestone/reward burst: a short success → soft → medium crescendo
   * (≈0/150/300ms, under 400ms total). Each step re-checks the preference, so
   * disabling haptics mid-sequence stops the remaining beats.
   */
  celebrate() {
    if (!on()) return
    void Haptics.notificationAsync(N.Success).catch(() => {})
    setTimeout(() => {
      if (on()) void Haptics.impactAsync(I.Soft).catch(() => {})
    }, 150)
    setTimeout(() => {
      if (on()) void Haptics.impactAsync(I.Medium).catch(() => {})
    }, 300)
  },
}
