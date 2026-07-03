import Foundation

// Ported from src/lib/links.ts + src/constants/legal.ts. v1 ships CODE-FIRST
// sharing (no universal links / AASA): every share carries the App Store link
// plus the 6-char code; the invitee types it on the welcome screen.
enum Links {
    static let appStore = URL(string: "https://apps.apple.com/app/id6781942293")!
    static let privacy  = URL(string: "https://hale-app.com/privacy")!
    static let terms    = URL(string: "https://hale-app.com/terms")!

    static let supportEmail = "johnpulavarthy@gmail.com"
    static var supportMailto: URL { URL(string: "mailto:\(supportEmail)")! }

    /// Referral share text — the typed code IS the attribution path for v1.
    static func referralShareText(code: String) -> String {
        "I'm quitting nicotine with HALE. Be my accountability buddy, and we'll keep each other "
        + "on streak. Get it on the App Store and enter my invite code \(code) when you join."
    }

    /// Buddy-invite share text — same typed-code door (code entry also pairs us).
    static func buddyShareText(code: String) -> String {
        "I'm quitting nicotine with HALE. Be my accountability buddy? We'll keep each other on "
        + "streak. Get it on the App Store and enter my invite code \(code) when you join."
    }

    /// iOS Share: text as message, App Store link as a separate URL item (matches
    /// inviteShareParams' iOS branch — iOS renders the url as its own item).
    static func inviteItems(_ text: String) -> [Any] { [text, appStore] }
}
