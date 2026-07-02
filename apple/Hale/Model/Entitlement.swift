import Foundation

// Ported from convex/model/entitlement.ts — HALE+ single source of truth.
// paid (RC mirror) > referral_reward. Any non-none source ⇒ hasHALEPlus.
enum EntitlementSource: String { case paid, referral_reward, none }

enum Entitlement {
    private static let dayMs: Double = 24 * 60 * 60 * 1000
    static let referralsRequired = 3
    static let referralActivationStreak = 3
    static let referralRewardDays = 7

    static func rewardEndsFrom(_ grantedAt: Double) -> Double {
        grantedAt + Double(referralRewardDays) * dayMs
    }

    struct RewardStatus: Equatable {
        let active: Bool
        let daysRemaining: Int
        let endsAt: Double?
    }

    static func referralRewardStatus(now: Double, rewardEndsAt: Double?) -> RewardStatus {
        guard let ends = rewardEndsAt else { return .init(active: false, daysRemaining: 0, endsAt: nil) }
        let msLeft = ends - now
        let active = msLeft > 0
        return .init(active: active, daysRemaining: active ? Int(ceil(msLeft / dayMs)) : 0, endsAt: ends)
    }

    struct Resolved: Equatable {
        let hasHALEPlus: Bool
        let source: EntitlementSource
        let referralRewardActive: Bool
        let rewardDaysRemaining: Int
    }

    // premium / referralRewardEndsAt are the structural slice of the users doc this reads.
    static func resolve(premium: Bool?, referralRewardEndsAt: Double?, now: Double) -> Resolved {
        let reward = referralRewardStatus(now: now, rewardEndsAt: referralRewardEndsAt)
        if premium == true {
            return .init(hasHALEPlus: true, source: .paid,
                         referralRewardActive: reward.active, rewardDaysRemaining: reward.daysRemaining)
        }
        if reward.active {
            return .init(hasHALEPlus: true, source: .referral_reward,
                         referralRewardActive: true, rewardDaysRemaining: reward.daysRemaining)
        }
        return .init(hasHALEPlus: false, source: .none, referralRewardActive: false, rewardDaysRemaining: 0)
    }
}
