import XCTest
@testable import Hale

final class ServiceTests: XCTestCase {
    func testDeepLinkReferral() {
        XCTAssertEqual(DeepLink.parse(URL(string: "hale://r/AB12CD")!), .referralCode("AB12CD"))
        XCTAssertEqual(DeepLink.parse(URL(string: "hale://u/user_123")!), .buddyInvite("user_123"))
        XCTAssertEqual(DeepLink.parse(URL(string: "com.ravipulavarthy.hale://r/XYZ")!), .referralCode("XYZ"))
    }
    func testDeepLinkRejects() {
        XCTAssertNil(DeepLink.parse(URL(string: "https://hale-app.com/r/AB")!))  // wrong scheme
        XCTAssertNil(DeepLink.parse(URL(string: "hale://x/AB")!))                // unknown segment
        XCTAssertNil(DeepLink.parse(URL(string: "hale://r/")!))                  // empty value
        XCTAssertNil(DeepLink.parse(URL(string: "hale://r")!))                   // no value
    }
    func testPremiumResolver() {
        XCTAssertTrue(PremiumResolver.hasPlus(rcActive: true, convexPremium: false, referralRewardActive: false))
        XCTAssertTrue(PremiumResolver.hasPlus(rcActive: false, convexPremium: true, referralRewardActive: false))
        XCTAssertTrue(PremiumResolver.hasPlus(rcActive: false, convexPremium: false, referralRewardActive: true))
        XCTAssertFalse(PremiumResolver.hasPlus(rcActive: false, convexPremium: false, referralRewardActive: false))
    }
}
