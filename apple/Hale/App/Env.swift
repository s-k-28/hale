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

    static let revenueCatKey    = "appl_DWGVewLMuBWXnziKvxqiglCNDwf"
    static let revenueEntitlement = "HALE+"
    static let oneSignalAppId   = ProcessInfo.processInfo.environment["ONESIGNAL_APP_ID"] ?? ""
    static let postHogKey       = ProcessInfo.processInfo.environment["POSTHOG_KEY"] ?? ""
    static let postHogHost      = "https://us.i.posthog.com"
    static let sentryDSN        = ProcessInfo.processInfo.environment["SENTRY_DSN"] ?? ""
}
