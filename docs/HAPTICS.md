# HALE — Haptics Reference

One file owns the Taptic Engine: **`src/lib/haptics.ts`** is the only place in
the app allowed to import `expo-haptics`. Everything else speaks in semantics
(`haptics.press()`, `haptics.success()`…), never raw impact styles, so the feel
of the app stays consistent and tunable from a single vocabulary.

Everything is fire-and-forget (never awaited, rejections swallowed — haptics are
a garnish, never on the critical path) and double-guarded: each method no-ops
unless the user preference is on **and** `Platform.OS === 'ios'`. This is an iOS
app; every method is a silent no-op elsewhere.

## The vocabulary

| Method | Native effect | When to use |
|---|---|---|
| `select()` | `selectionAsync()` | Pickers, chips, toggles, tab switches, step advances |
| `tap()` | impact `Light` | Secondary/ghost buttons, list rows, dismissals |
| `press()` | impact `Medium` | Primary CTAs (the one action on a screen) |
| `heavy()` | impact `Heavy` | SOS entry, the quit-commit moment |
| `soft()` | impact `Soft` | Ambient beats (minute ticks, reply arrival) |
| `rigid()` | impact `Rigid` | Reserved — sharp, mechanical feedback |
| `success()` | notification `Success` | An outcome landed well (a save, a check-in) |
| `warn()` | notification `Warning` | The **system** warns the user — never a slip |
| `error()` | notification `Error` | The **system** failed the user — never a relapse |
| `breath('in' \| 'out')` | impact `Soft` (in) / `Light` (out) | Breathing exercise beats; hold phases stay silent by design |
| `celebrate()` | `Success` → `Soft` → `Medium` (≈0/150/300ms) | The milestone/reward burst |

`celebrate()` re-checks the preference at each step, so disabling haptics
mid-sequence stops the remaining beats. Total under 400ms.

## The two ownership rules

These keep the vocabulary from double-firing on a single touch:

1. **Interactions are owned by the UI primitives.** `Button`, `Chip`, `OptRow`,
   and `IconBtn` fire their own press-in haptic. Call sites must NOT add one on
   top. `Button` picks its haptic by variant (`primary`/`coral`/`warm` →
   `press`, `secondary`/`ghost` → `tap`); override with the `haptic` prop
   (`'press' | 'tap' | 'select' | 'none'`).
2. **Outcomes are owned by the call site.** `success`/`warn`/`error`/
   `celebrate`/`breath` describe what *happened* — the primitive can't know
   that, so the screen fires it.

## The anti-shame rule

Relapse, slip, and reset-the-counter flows **NEVER** use `error()` or `warn()`.
A slip is not a failure the device should scold. Those moments stay silent or
use a soft/neutral beat. `error`/`warn` are for the *system* failing the user (a
dropped network save), never for the user "failing".

## Settings

The preference is persisted in AsyncStorage under **`hale:hapticsEnabled`**.
DEFAULT-ON: only a literal stored `'false'` disables; missing or any other value
= enabled. `initHaptics()` hydrates it once at the root layout (it lives there,
not in PushSync, so haptics respect the saved setting from the first touch —
including pre-auth onboarding). The Settings switch reads `getHapticsEnabled()`
and writes `setHapticsEnabled(on)` (effective immediately; the write is
fire-and-forget).

## Feel-testing

**The simulator does not render haptics** — `expo-haptics` calls are silent
no-ops there. Feel-testing requires a physical device.
