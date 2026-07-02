import Foundation

// Custom-scheme deep links (hale:// and com.ravipulavarthy.hale://). No universal
// links in v1 (sharing is code-first — see src/lib/links.ts).
enum DeepLink: Equatable {
    case referralCode(String)   // hale://r/<code>  → resolve → buddy invite
    case buddyInvite(String)    // hale://u/<inviterId>

    static func parse(_ url: URL) -> DeepLink? {
        guard url.scheme == "hale" || url.scheme == "com.ravipulavarthy.hale" else { return nil }
        // host may carry the segment (hale://r/CODE → host "r", path "/CODE")
        var parts = [String]()
        if let host = url.host, !host.isEmpty { parts.append(host) }
        parts.append(contentsOf: url.pathComponents.filter { $0 != "/" })
        guard parts.count >= 2 else { return nil }
        let value = parts[1].trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty else { return nil }
        switch parts[0] {
        case "r": return .referralCode(value)
        case "u": return .buddyInvite(value)
        default:  return nil
        }
    }
}

// Client-side premium truth (mirrors usePremium): RC entitlement OR the Convex
// premium mirror OR an active referral reward.
enum PremiumResolver {
    static func hasPlus(rcActive: Bool, convexPremium: Bool, referralRewardActive: Bool) -> Bool {
        rcActive || convexPremium || referralRewardActive
    }
}
