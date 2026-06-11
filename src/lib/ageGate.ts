import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * 21+ age confirmation (App Store Guideline 2.18) — asked ONCE, before any
 * cessation content, at the very start of onboarding. Stored locally because
 * it must gate BEFORE any account exists (deferred sign-up); a fresh install
 * is a fresh person, so re-asking there is correct.
 */
const KEY = 'hale:ageConfirmed21'

export async function getAgeConfirmed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true'
  } catch {
    // Storage failure → ask again rather than skip the gate.
    return false
  }
}

export async function setAgeConfirmed(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true')
  } catch {
    // Non-fatal: worst case the gate asks once more next launch.
  }
}
