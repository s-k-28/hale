import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * One-time medical-disclaimer acknowledgement (Guideline 1.4.1) — shown right
 * after the 21+ gate, before any cessation content. Local for the same reason
 * as the age gate: it must run before any account exists.
 */
const KEY = 'hale:disclaimerAck'

export async function getDisclaimerAck(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true'
  } catch {
    return false
  }
}

export async function setDisclaimerAck(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true')
  } catch {
    // Non-fatal: worst case it shows once more next launch.
  }
}
