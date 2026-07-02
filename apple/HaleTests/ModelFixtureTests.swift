import XCTest
@testable import Hale

// Golden-fixture parity: every case is computed by the TS source (convex/model)
// via scripts/gen-model-fixtures.ts; the Swift port must match exactly.
final class ModelFixtureTests: XCTestCase {
    struct Fixtures: Decodable {
        struct DailySpend: Decodable { let baselinePerDay, unitCost, expected: Double }
        struct MoneySaved: Decodable { let baselinePerDay, unitCost, ms, expected: Double }
        struct Projected: Decodable { let productType: String; let baselinePerDay, unitCost, expected: Double }
        struct NextMile: Decodable { let quitStart, now: Double; let expectedHours: Double? }
        struct Reached: Decodable { let quitStart, now: Double; let expected: Int }
        struct Recovery: Decodable { let quitStart, now, expected: Double }
        struct LocalDate: Decodable { let epochMs: Double; let tz, expected: String }
        struct LocalHour: Decodable { let epochMs: Double; let tz: String; let expected: Int }
        struct DayDiff: Decodable { let from, to: String; let expected: Int }
        struct Streak: Decodable { let last: String?; let today: String; let currentStreak, freezes, expectedNew: Int; let expectedUsedFreeze: Bool; let expectedFreezes: Int }
        struct Stage: Decodable { let quitStart, now: Double; let expected: String }
        struct Reward: Decodable { let now: Double; let endsAt: Double?; let active: Bool; let days: Int }
        struct Ent: Decodable { let premium: Bool?; let endsAt: Double?; let now: Double; let has: Bool; let source: String; let rewardActive: Bool; let days: Int }

        let dailySpend: [DailySpend]
        let moneySaved: [MoneySaved]
        let projectedAnnualSavings: [Projected]
        let nextHealthMilestone: [NextMile]
        let reachedCount: [Reached]
        let recoveryFraction: [Recovery]
        let localDateOf: [LocalDate]
        let localHourOf: [LocalHour]
        let dayDiff: [DayDiff]
        let computeStreak: [Streak]
        let quitStage: [Stage]
        let referralReward: [Reward]
        let entitlement: [Ent]
    }

    private func load() throws -> Fixtures {
        let url = try XCTUnwrap(TestBundle.url("model-fixtures", "json"), "model-fixtures.json missing from test bundle")
        return try JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: url))
    }

    func testPlanMath() throws {
        let f = try load()
        for c in f.dailySpend {
            XCTAssertEqual(Plan.dailySpend(baselinePerDay: c.baselinePerDay, unitCost: c.unitCost), c.expected, accuracy: 1e-9)
        }
        for c in f.moneySaved {
            XCTAssertEqual(Plan.moneySaved(baselinePerDay: c.baselinePerDay, unitCost: c.unitCost, ms: c.ms), c.expected, accuracy: 1e-6)
        }
        for c in f.projectedAnnualSavings {
            let p = QuitProfile(productType: ProductType(rawValue: c.productType)!, baselinePerDay: c.baselinePerDay, unitCost: c.unitCost)
            XCTAssertEqual(Plan.projectedAnnualSavings(p), c.expected, accuracy: 1e-6)
        }
    }

    func testHealthMilestones() throws {
        let f = try load()
        for c in f.nextHealthMilestone {
            XCTAssertEqual(Plan.nextHealthMilestone(quitStart: c.quitStart, now: c.now)?.hours, c.expectedHours)
        }
        for c in f.reachedCount {
            XCTAssertEqual(Plan.reachedHealthMilestones(quitStart: c.quitStart, now: c.now).count, c.expected)
        }
        for c in f.recoveryFraction {
            XCTAssertEqual(Plan.recoveryFraction(quitStart: c.quitStart, now: c.now), c.expected, accuracy: 1e-12)
        }
    }

    func testStreakAndTimezone() throws {
        let f = try load()
        for c in f.localDateOf {
            XCTAssertEqual(Streak.localDateOf(c.epochMs, timezone: c.tz), c.expected, "tz=\(c.tz) ms=\(c.epochMs)")
        }
        for c in f.localHourOf {
            XCTAssertEqual(Streak.localHourOf(c.epochMs, timezone: c.tz), c.expected, "tz=\(c.tz) ms=\(c.epochMs)")
        }
        for c in f.dayDiff {
            XCTAssertEqual(Streak.dayDiff(c.from, c.to), c.expected, "\(c.from)→\(c.to)")
        }
        for c in f.computeStreak {
            let r = Streak.computeStreakOnCheckIn(lastCheckInLocalDate: c.last, todayLocalDate: c.today,
                                                  currentStreak: c.currentStreak, freezesRemaining: c.freezes)
            XCTAssertEqual(r.newStreak, c.expectedNew)
            XCTAssertEqual(r.usedFreeze, c.expectedUsedFreeze)
            XCTAssertEqual(r.freezesRemaining, c.expectedFreezes)
        }
    }

    func testCohortAndEntitlement() throws {
        let f = try load()
        for c in f.quitStage {
            XCTAssertEqual(Cohort.quitStage(quitStartMs: c.quitStart, nowMs: c.now).rawValue, c.expected)
        }
        for c in f.referralReward {
            let r = Entitlement.referralRewardStatus(now: c.now, rewardEndsAt: c.endsAt)
            XCTAssertEqual(r.active, c.active)
            XCTAssertEqual(r.daysRemaining, c.days)
        }
        for c in f.entitlement {
            let r = Entitlement.resolve(premium: c.premium, referralRewardEndsAt: c.endsAt, now: c.now)
            XCTAssertEqual(r.hasHALEPlus, c.has)
            XCTAssertEqual(r.source.rawValue, c.source)
            XCTAssertEqual(r.referralRewardActive, c.rewardActive)
            XCTAssertEqual(r.rewardDaysRemaining, c.days)
        }
    }
}
