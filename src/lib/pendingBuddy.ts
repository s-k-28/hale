import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * A buddy invite (hale://u/<inviterId>) opened by someone who isn't onboarded yet
 * gets stashed here, then redeemed once they finish the quiz + commit — so a fresh
 * invitee "auto-pairs on first open" (PRD S1) instead of losing the invite.
 */
const KEY = 'hale:pendingBuddyId'

export async function setPendingBuddy(inviterId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, inviterId)
  } catch {
    // Non-fatal: worst case the invitee just lands unpaired and can re-open the link.
  }
}

/** Read + clear in one shot, so an invite is only ever redeemed once. */
export async function takePendingBuddy(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY)
    if (v) await AsyncStorage.removeItem(KEY)
    return v
  } catch {
    return null
  }
}
