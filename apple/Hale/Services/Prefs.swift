import Foundation

// UserDefaults-backed local flags — the AsyncStorage keys from the RN app, verbatim.
// (Auth tokens live in the Keychain via TokenStore, not here.)
enum Prefs {
    private static let d = UserDefaults.standard

    // consent / gates
    static var ageConfirmed21: Bool {
        get { d.bool(forKey: "hale:ageConfirmed21") }
        set { d.set(newValue, forKey: "hale:ageConfirmed21") }
    }
    static var disclaimerAck: Bool {
        get { d.bool(forKey: "hale:disclaimerAck") }
        set { d.set(newValue, forKey: "hale:disclaimerAck") }
    }
    // analytics opt-out stored as the literal "1" (matches RN hale_analytics_opt_out)
    static var analyticsOptedOut: Bool {
        get { d.string(forKey: "hale_analytics_opt_out") == "1" }
        set { d.set(newValue ? "1" : "0", forKey: "hale_analytics_opt_out") }
    }
    // referral deferred-attribution stash
    static var pendingBuddyId: String? {
        get { d.string(forKey: "hale:pendingBuddyId") }
        set { d.set(newValue, forKey: "hale:pendingBuddyId") }
    }
    static var lastCelebratedLandmark: Int {
        get { d.integer(forKey: "hale:lastCelebratedLandmark") }
        set { d.set(newValue, forKey: "hale:lastCelebratedLandmark") }
    }
    // first-touch activation flags
    static var firstSage: Bool {
        get { d.bool(forKey: "hale:firstSage") }
        set { d.set(newValue, forKey: "hale:firstSage") }
    }
    static var firstSos: Bool {
        get { d.bool(forKey: "hale:firstSos") }
        set { d.set(newValue, forKey: "hale:firstSos") }
    }

    // Delete-account: clear all local prefs (Keychain is cleared separately by TokenStore).
    static func clearAll() {
        for key in ["hale:ageConfirmed21", "hale:disclaimerAck", "hale_analytics_opt_out",
                    "hale:pendingBuddyId", "hale:lastCelebratedLandmark", "hale:firstSage",
                    "hale:firstSos", "hale:hapticsEnabled"] {
            d.removeObject(forKey: key)
        }
    }
}
