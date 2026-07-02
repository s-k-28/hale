import Foundation
import PostHog

// Ported from src/lib/analytics.ts. Opt-out persisted (Prefs.analyticsOptedOut),
// autocapture off, geoip off, cohort snapshot merged into every capture.
// Event names must stay string-identical to the RN taxonomy for continuity.
enum AnalyticsService {
    // Updated by the app (mirrors the RN event-level cohort snapshot).
    static var cohort: [String: String] = [:]

    static func configure() {
        guard !Env.postHogKey.isEmpty, !Prefs.analyticsOptedOut else { return }
        let cfg = PostHogConfig(apiKey: Env.postHogKey, host: Env.postHogHost)
        cfg.captureApplicationLifecycleEvents = false
        cfg.captureScreenViews = false
        PostHogSDK.shared.setup(cfg)
    }

    static func identify(_ convexUserId: String) {
        guard !Prefs.analyticsOptedOut else { return }
        PostHogSDK.shared.identify(convexUserId)
    }

    static func track(_ event: Ev, _ props: [String: Any] = [:]) {
        guard !Prefs.analyticsOptedOut else { return }
        var merged = props
        for (k, v) in cohort where merged[k] == nil { merged[k] = v }
        PostHogSDK.shared.capture(event.rawValue, properties: merged)
    }

    // Consent withdrawal (You ▸ Settings). Guideline 5.1.1(ii).
    static func setOptedOut(_ optedOut: Bool) {
        Prefs.analyticsOptedOut = optedOut
        if optedOut { PostHogSDK.shared.optOut() } else { PostHogSDK.shared.optIn() }
    }
}

// Core event taxonomy (string-identical to src/lib/analytics.ts `Ev`). Extended
// per-screen in Phase 4 as more events are fired.
enum Ev: String {
    case onboardingStarted = "onboarding_started"
    case planViewed = "plan_viewed"
    case quitCommitted = "quit_committed"
    case checkInCompleted = "check_in_completed"
    case cravingLogged = "craving_logged"
    case cravingSurvived = "craving_survived"
    case sosOpened = "sos_opened"
    case relapseLogged = "relapse_logged"
    case coachMessageSent = "coach_message_sent"
    case sageCapHit = "sage_cap_hit"
    case paywallViewed = "paywall_viewed"
    case paywallFeatureTapped = "paywall_feature_tapped"
    case purchaseCompleted = "purchase_completed"
    case subscriptionStarted = "subscription_started"
    case pushOpened = "push_opened"
    case buddyPaired = "buddy_paired"
    case referralShared = "referral_shared"
}
