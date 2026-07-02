import Foundation

// Ported from convex/model/plan.ts — PURE plan math. Single source of truth for
// $ saved + the health-recovery timeline. Timestamps are epoch milliseconds
// (Double, matching JS numbers). Verified against golden fixtures (HaleTests).
enum ProductType: String, Codable { case vape, pouch, cig, mixed }

struct QuitProfile {
    let productType: ProductType
    let baselinePerDay: Double  // units/day
    let unitCost: Double        // $ per unit
}

enum Plan {
    static let msPerDay: Double = 86_400_000
    static let daysPerMonth = 30
    static let maxDailySpend: Double = 100   // $/day defensive ceiling

    static func dailySpend(baselinePerDay: Double, unitCost: Double) -> Double {
        min(maxDailySpend, max(0, baselinePerDay * unitCost))
    }

    static func moneySaved(baselinePerDay: Double, unitCost: Double, ms: Double) -> Double {
        let days = ms / msPerDay
        return max(0, days * dailySpend(baselinePerDay: baselinePerDay, unitCost: unitCost))
    }

    static func projectedAnnualSavings(_ p: QuitProfile) -> Double {
        dailySpend(baselinePerDay: p.baselinePerDay, unitCost: p.unitCost) * 365
    }

    struct HealthMilestone: Equatable { let hours: Double; let label: String }

    // Population-typical timeline (CDC / WHO / US Surgeon General). Order preserved.
    static let healthMilestones: [HealthMilestone] = [
        .init(hours: 0.33, label: "Heart rate typically starts to settle"),
        .init(hours: 8, label: "Blood oxygen typically returns toward normal"),
        .init(hours: 24, label: "Carbon monoxide typically cleared from blood"),
        .init(hours: 48, label: "Nicotine largely out of the system for most people"),
        .init(hours: 72, label: "Breathing typically eases as airways relax"),
        .init(hours: 24 * 7, label: "Taste & smell typically sharpen"),
        .init(hours: 24 * 14, label: "Circulation typically improving"),
        .init(hours: 24 * 30, label: "Cravings typically ease (receptors resetting)"),
        .init(hours: 24 * 90, label: "Lung function typically improves noticeably"),
        .init(hours: 24 * 365, label: "Excess heart-disease risk typically about halved"),
    ]

    static let landmarkDays = [1, 3, 7, 14, 30, 60, 90, 180, 365]

    static func nextHealthMilestone(quitStart: Double, now: Double) -> HealthMilestone? {
        let elapsedH = (now - quitStart) / 3_600_000
        return healthMilestones.first { $0.hours > elapsedH }
    }

    static func reachedHealthMilestones(quitStart: Double, now: Double) -> [HealthMilestone] {
        let elapsedH = (now - quitStart) / 3_600_000
        return healthMilestones.filter { $0.hours <= elapsedH }
    }

    static func recoveryFraction(quitStart: Double, now: Double) -> Double {
        Double(reachedHealthMilestones(quitStart: quitStart, now: now).count) / Double(healthMilestones.count)
    }
}
