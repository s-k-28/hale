import Foundation

// Environment config. All values here are client-public (they live in eas.json /
// .env.example in the RN app). Dev points at the LOCAL Convex backend; never point
// a dev build at prod (agreeable-mongoose-741). Phase 3 can move these to xcconfig
// per build configuration; the DEBUG/RELEASE split below is the seam.
enum Env {
    #if DEBUG
    static let convexURL = "http://127.0.0.1:3210"          // local:local-johnpulavarthy-hale
    static let convexSiteURL = "http://127.0.0.1:3211"
    #else
    static let convexURL = "https://agreeable-mongoose-741.convex.cloud"
    static let convexSiteURL = "https://agreeable-mongoose-741.convex.site"
    #endif

    // Client-public analytics/push/crash config. These are identical across dev
    // and prod (only convexURL differs by configuration), and they ship inside
    // every client build anyway (RN bundled them via EXPO_PUBLIC_*), so they are
    // safe to hardcode. A process-env value still wins when present (handy for
    // pointing a local build at a throwaway project).
    static let revenueCatKey    = "appl_DWGVewLMuBWXnziKvxqiglCNDwf"
    static let revenueEntitlement = "HALE+"
    static let oneSignalAppId   = ProcessInfo.processInfo.environment["ONESIGNAL_APP_ID"]
        ?? "b358ef20-dddc-4f13-87df-2bd8213ed708"
    // PostHog project API key (phc_…) is a runtime secret not committed to the
    // repo. Paste it here before shipping Release, or export POSTHOG_KEY for the
    // build. Empty is safe: AnalyticsService.configure() no-ops on an empty key.
    static let postHogKey       = ProcessInfo.processInfo.environment["POSTHOG_KEY"] ?? ""
    static let postHogHost      = "https://us.i.posthog.com"
    static let sentryDSN        = ProcessInfo.processInfo.environment["SENTRY_DSN"]
        ?? "https://282bcb332a6fc7b89e0c0ca15a0c0dd1@o4511662759280640.ingest.us.sentry.io/4511662769504256"

    // Google Sign-In (OAuth 2.0 native PKCE). The iOS OAuth client id from the
    // Google Cloud Console. EMPTY until provisioned — the Google button is hidden
    // while empty, so the app builds and runs without it. When set, also add the
    // reversed-client-id URL scheme to Info.plist and set GOOGLE_CLIENT_ID on the
    // Convex deployment (the backend audience check).
    static let googleClientID = ProcessInfo.processInfo.environment["GOOGLE_CLIENT_ID"] ?? ""
    // Derived OAuth redirect (reversed client id). Only meaningful when configured.
    static var googleRedirectURI: String {
        let reversed = googleClientID.split(separator: ".").reversed().joined(separator: ".")
        return "\(reversed):/oauth2redirect"
    }
}
