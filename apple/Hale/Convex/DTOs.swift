import Foundation

// Swift mirrors of the Convex function return/arg shapes (derived from convex/*.ts).
// Integer-valued v.number() fields are Int; money/ratio/timestamp fields are Double.
// Optional = JSON null OR absent key. Nullable-root queries decode as Optional<DTO>.

// MARK: users
struct TodayState: Decodable, Equatable {
    let userId: String
    let hardestHour: Int?
    let quitStart: Double
    let currentMoneySaved: Double
    let lifetimeMoneySaved: Double
    let currentStreak: Int
    let longestStreak: Int
    let freezesRemaining: Int
    let lastCheckInLocalDate: String?
    let nextMilestone: Milestone?
    let premium: Bool
    let trialEndsAt: Double?
    let trialActive: Bool
    let trialDaysRemaining: Int
    let hasHALEPlus: Bool
    let entitlementSource: String
    let referralRewardActive: Bool
    let rewardDaysRemaining: Int
    let timezone: String?
    struct Milestone: Decodable, Equatable { let hours: Double; let label: String }
}

struct AiConsent: Decodable { let consented: Bool }
struct CommunityRules: Decodable { let accepted: Bool }
struct OnboardResult: Decodable { let attemptId: String; let userId: String }
struct LinkResult: Decodable { let linked: Bool; let changed: Bool }

// MARK: buddies
struct BuddyLink: Decodable, Equatable {
    let id: String
    let creationTime: Double
    let pairKey: String
    let userA: String
    let userB: String
    let status: String
    let sharedStreak: Int
    let lastSharedLocalDate: String?
    let pairedAt: Double?
    let endedAt: Double?
    let pairingMethod: String?
    let initiatorId: String?
    enum CodingKeys: String, CodingKey {
        case id = "_id", creationTime = "_creationTime", pairKey, userA, userB, status
        case sharedStreak, lastSharedLocalDate, pairedAt, endedAt, pairingMethod, initiatorId
    }
}
struct MyBuddy: Decodable {
    let link: BuddyLink
    let buddy: Buddy
    struct Buddy: Decodable { let name: String?; let currentStreak: Int; let lastCheckInLocalDate: String? }
}

// MARK: sage
struct SageMessage: Decodable, Identifiable, Equatable {
    let id: String
    let creationTime: Double
    let userId: String
    let role: String            // "user" | "sage"
    let content: String
    let ts: Double
    let inputTokens: Int?
    let outputTokens: Int?
    let costUsdProxy: Double?
    let userTier: String?
    let cacheHit: Bool?
    let model: String?
    enum CodingKeys: String, CodingKey {
        case id = "_id", creationTime = "_creationTime", userId, role, content, ts
        case inputTokens, outputTokens, costUsdProxy, userTier, cacheHit, model
    }
}
struct SageSendResult: Decodable { let accepted: Bool; let tier: String; let dailyCount: Int; let capType: String? }

// relapse.logRelapse(kind:"relapse") return
struct RelapseResult: Decodable {
    let streakAtRelapse: Int?
    let lapsesBeforeRelapse: Int?
    let lifetimeMoneySaved: Double?
    let bestStreak: Int?
}

// MARK: nudges
struct Nudge: Decodable, Identifiable {
    let id: String; let type: String; let ts: Double; let title: String; let body: String
    enum CodingKeys: String, CodingKey { case id = "_id", type, ts, title, body }
}

// MARK: referrals
struct ReferralProgress: Decodable {
    let code: String?
    let completedCount: Int
    let target: Int
    let rewardActive: Bool
    let rewardDaysRemaining: Int
    let rewardGranted: Bool
    let invitees: [Invitee]
    struct Invitee: Decodable { let name: String?; let status: String; let pairedAt: Double? }
}
struct CodeResult: Decodable { let code: String; let userId: String }
struct ResolveCodeResult: Decodable { let userId: String }   // nullable root

// MARK: goals
struct Goal: Decodable, Identifiable {
    let id: String; let label: String; let targetAmount: Double
    let createdAt: Double; let achievedAt: Double?; let saved: Double
    let remaining: Double; let ratio: Double; let reached: Bool
    enum CodingKeys: String, CodingKey {
        case id = "_id", label, targetAmount, createdAt, achievedAt, saved, remaining, ratio, reached
    }
}

// MARK: cravings
struct Craving: Decodable, Identifiable {
    let id: String; let creationTime: Double; let userId: String; let attemptId: String
    let ts: Double; let localHour: Int; let intensity: Int
    let trigger: String?; let context: String?; let outcome: String; let resolvedBy: String?
    enum CodingKeys: String, CodingKey {
        case id = "_id", creationTime = "_creationTime", userId, attemptId, ts, localHour
        case intensity, trigger, context, outcome, resolvedBy
    }
}

// MARK: analytics
struct CravingTrendPoint: Decodable { let date: String; let count: Int; let avgIntensity: Double }
struct RecoverySummary: Decodable { let reached: Int; let total: Int; let nextLabel: String? }
struct CravingPatterns: Decodable {
    let byHour: [HourBucket]
    let peakHour: Int?
    let topTrigger: String?
    let total: Int
    struct HourBucket: Decodable { let hour: Int; let count: Int; let avgIntensity: Double }
}

// MARK: leagues / squads / feed
struct MyLeague: Decodable {
    let optedIn: Bool
    let bucket: String?
    let rank: Int?
    let entries: [Entry]
    struct Entry: Decodable { let name: String; let score: Int; let isMe: Bool }
}
struct Squad: Decodable, Identifiable {
    let id: String; let name: String; let isPublic: Bool; let memberCount: Int
    let role: String; let inviteCode: String; let challengeEnd: Double?; let challengeGoalDays: Int?
    enum CodingKeys: String, CodingKey {
        case id = "_id", name, isPublic, memberCount, role, inviteCode, challengeEnd, challengeGoalDays
    }
}
struct FeedEvent: Decodable, Identifiable {
    let id: String; let type: String; let ts: Double; let isMine: Bool
    enum CodingKeys: String, CodingKey { case id = "_id", type, ts, isMine }   // payload is v.any() — omitted
}
