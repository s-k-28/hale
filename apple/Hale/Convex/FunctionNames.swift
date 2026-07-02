import Foundation

// Central registry of Convex function names ("module:function"). No string
// literals at call sites. Mirrors convex/*.ts — keep in sync with the backend.
enum Fn {
    // auth (public actions from @convex-dev/auth)
    static let signIn  = "auth:signIn"
    static let signOut = "auth:signOut"

    // users
    static let todayState           = "users:todayState"
    static let completeOnboarding   = "users:completeOnboarding"
    static let linkOneSignal        = "users:linkOneSignal"
    static let aiConsentStatus      = "users:aiConsentStatus"
    static let setAiConsent         = "users:setAiConsent"
    static let revokeAiConsent      = "users:revokeAiConsent"
    static let communityRulesStatus = "users:communityRulesStatus"
    static let acceptCommunityRules = "users:acceptCommunityRules"

    // checkins / cravings / relapse
    static let checkIn            = "checkins:checkIn"
    static let logCraving         = "cravings:logCraving"
    static let recentCravings     = "cravings:recent"
    static let logRelapse         = "relapse:logRelapse"
    static let noteRelapseTrigger = "relapse:noteRelapseTrigger"

    // buddies / feed / nudges
    static let myBuddy      = "buddies:myBuddy"
    static let pairWith     = "buddies:pairWith"
    static let unpair       = "buddies:unpair"
    static let requestMatch = "buddies:requestMatch"
    static let invite       = "buddies:invite"
    static let buddyFeed    = "feed:buddyFeed"
    static let sendStrength = "feed:sendStrength"
    static let myNudges     = "nudges:myNudges"
    static let markRead     = "nudges:markRead"
    static let cheer        = "nudges:cheer"
    static let sendNudge    = "nudges:send"

    // referrals
    static let getOrCreateMyCode = "referrals:getOrCreateMyCode"
    static let resolveCode       = "referrals:resolveCode"
    static let attributeInstall  = "referrals:attributeInstall"
    static let myProgress        = "referrals:myProgress"

    // sage
    static let sageMessages = "sage:messages"
    static let sageSend     = "sage:send"

    // goals / leagues / squads
    static let myGoals     = "goals:myGoals"
    static let setGoal     = "goals:setGoal"
    static let deleteGoal  = "goals:deleteGoal"
    static let myLeague    = "leagues:myLeague"
    static let leagueOptIn = "leagues:optIn"
    static let leaveLeague = "leagues:leaveLeague"
    static let mySquads    = "squads:mySquads"
    static let squadDetail = "squads:squadDetail"
    static let publicSquads = "squads:publicSquads"
    static let createSquad = "squads:createSquad"
    static let joinByCode  = "squads:joinByCode"
    static let leaveSquad  = "squads:leaveSquad"

    // analytics
    static let cravingTrend     = "analytics:cravingTrend"
    static let cravingPatterns  = "analytics:cravingPatterns"
    static let recoverySummary  = "analytics:recoverySummary"

    // community
    static let communityGroups   = "community:groups"
    static let resolveGroup      = "community:resolveGroup"
    static let joinGroup         = "community:joinGroup"
    static let myProfiles        = "community:myProfiles"
    static let feed              = "communityPosts:feed"
    static let createPost        = "communityPosts:createPost"
    static let createComment     = "communityPosts:createComment"
    static let comments          = "communityPosts:comments"
    static let toggleReaction    = "communityPosts:toggleReaction"
    static let myCrisisAlerts    = "communityPosts:myCrisisAlerts"
    static let ackCrisisCard     = "communityPosts:ackCrisisCard"
    static let reportContent     = "communityModeration:reportContent"
    static let muteProfile       = "communityModeration:muteProfile"
    static let unmuteProfile     = "communityModeration:unmuteProfile"
    static let myMutes           = "communityModeration:myMutes"

    // account
    static let deleteAccount = "account:deleteAccount"
}
