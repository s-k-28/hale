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

// The §9 event map — full taxonomy, ported verbatim from src/lib/analytics.ts `Ev`.
// Raw values MUST stay string-identical to the RN taxonomy for analytics continuity.
enum Ev: String {
    // Onboarding / activation funnel (O1)
    case onboardingStarted = "onboarding_started"
    case planViewed = "plan_viewed"
    case quitCommitted = "quit_committed"
    // Progress (P1/P2/P3)
    case counterViewed = "counter_viewed"
    case checkinCompleted = "checkin_completed"
    case streakFreezeUsed = "streak_freeze_used"
    case milestoneReached = "milestone_reached"
    case cardShared = "card_shared"
    // Social (S1/S2)
    case buddyInvited = "buddy_invited"
    case buddyPaired = "buddy_paired"
    case buddyUnpaired = "buddy_unpaired"
    case referralCodeEntered = "referral_code_entered"
    case nudgeSent = "nudge_sent"
    case nudgeOpened = "nudge_opened"
    // Intelligence (I1/I2/I3/I4)
    case cravingSosOpened = "craving_sos_opened"
    case cravingLogged = "craving_logged"
    case cravingSurvived = "craving_survived"
    case coachMessageSent = "coach_message_sent"
    case coachSession = "coach_session"
    case proactiveNudgeSent = "proactive_nudge_sent"
    case relapseLogged = "relapse_logged"
    case relapseRecovered = "relapse_recovered"
    // Notifications
    case pushOpened = "push_opened"
    // Account lifecycle (Guideline 5.1.1(v))
    case accountDeleted = "account_deleted"
    // Monetization
    case trialStarted = "trial_started"
    case paywallViewed = "paywall_viewed"
    case purchaseCompleted = "purchase_completed"
    case paywallFeatureTapped = "paywall_feature_tapped"
    case subscriptionStarted = "subscription_started"
    // Referral reward funnel
    case referralLinkShared = "referral_link_shared"
    case referralInstallAttributed = "referral_install_attributed"
    case referralBuddyPaired = "referral_buddy_paired"
    case referralCompleted = "referral_completed"
    case rewardGranted = "reward_granted"
    // Account sign-in / "save your progress"
    case savePromptShown = "save_prompt_shown"
    case accountLinked = "account_linked"
    // Buddy-activation (P1)
    case inviteOffered = "invite_offered"
    case soloBridgeTaken = "solo_bridge_taken"
    case matchmakingRequested = "matchmaking_requested"
    case matchmakingMatched = "matchmaking_matched"
    case matchmakingNoMatch = "matchmaking_no_match"
    case unpairedNudgeSent = "unpaired_nudge_sent"
    case unpairedNudgeOpened = "unpaired_nudge_opened"
    // Activation instrumentation (P2)
    case activatedPairedQuitter = "activated_paired_quitter"
    case firstCheckIn = "first_check_in"
    case firstSos = "first_sos"
    case firstSageMessage = "first_sage_message"
    // Sage cost controls (P3)
    case sageMessageCompleted = "sage_message_completed"
    case sageCapHit = "sage_cap_hit"
    // Relapse signal (P2)
    case relapseTriggerNamed = "relapse_trigger_named"
    // Phase 2 (post-launch) — squads, leagues, rally (several gated off in v1;
    // defined so the taxonomy stays stable). savings_goal_set / goal_deleted /
    // analytics_viewed ARE fired today.
    case squadCreated = "squad_created"
    case squadJoined = "squad_joined"
    case squadInvited = "squad_invited"
    case squadLeft = "squad_left"
    case challengeCompleted = "challenge_completed"
    case leagueOptin = "league_optin"
    case rallySent = "rally_sent"
    case savingsGoalSet = "savings_goal_set"
    case goalDeleted = "goal_deleted"
    case analyticsViewed = "analytics_viewed"
}
