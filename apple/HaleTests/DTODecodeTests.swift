import XCTest
@testable import Hale

// Decodes REAL payloads captured from the live Convex backend into the Swift DTOs,
// so DTO drift vs the backend surfaces as a failing test.
final class DTODecodeTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ file: String) throws -> T {
        let url = try XCTUnwrap(TestBundle.url(file, "json"), "\(file).json missing from test bundle")
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    func testTodayStateDecodes() throws {
        let s = try decode(TodayState.self, "users_todayState")
        XCTAssertFalse(s.userId.isEmpty)
        XCTAssertGreaterThan(s.quitStart, 0)
        XCTAssertGreaterThanOrEqual(s.currentStreak, 0)
        XCTAssertFalse(s.entitlementSource.isEmpty)
    }

    func testAiConsentDecodes() throws {
        _ = try decode(AiConsent.self, "users_aiConsentStatus")
    }

    func testRecoverySummaryDecodes() throws {
        let r = try decode(RecoverySummary.self, "analytics_recoverySummary")
        XCTAssertEqual(r.total, 10)   // HEALTH_MILESTONES.count
    }

    func testCravingPatternsDecodes() throws {
        let p = try decode(CravingPatterns.self, "analytics_cravingPatterns")
        XCTAssertEqual(p.byHour.count, 24)
    }

    func testReferralProgressDecodes() throws {
        let r = try decode(ReferralProgress.self, "referrals_myProgress")
        XCTAssertEqual(r.target, 3)
        XCTAssertNil(r.code)          // fresh user: code null
    }
}
