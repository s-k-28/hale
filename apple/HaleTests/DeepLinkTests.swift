import XCTest
@testable import Hale

// Pure-logic edge cases for the deep-link parser and the premium truth resolver.
final class DeepLinkTests: XCTestCase {
    private func parse(_ s: String) -> DeepLink? {
        guard let u = URL(string: s) else { return nil }
        return DeepLink.parse(u)
    }

    func testReferralCodeHostForm() {
        XCTAssertEqual(parse("hale://r/ABC123"), .referralCode("ABC123"))
    }

    func testBuddyInviteHostForm() {
        XCTAssertEqual(parse("hale://u/user_42"), .buddyInvite("user_42"))
    }

    func testBundleScheme() {
        XCTAssertEqual(parse("com.ravipulavarthy.hale://r/XYZ"), .referralCode("XYZ"))
        XCTAssertEqual(parse("com.ravipulavarthy.hale://u/abc"), .buddyInvite("abc"))
    }

    func testCasePreservedInValue() {
        XCTAssertEqual(parse("hale://r/aB9xYz"), .referralCode("aB9xYz"))
    }

    func testWrongSchemeIsNil() {
        XCTAssertNil(parse("https://hale-app.com/r/CODE"))
        XCTAssertNil(parse("myapp://r/CODE"))
    }

    func testUnknownRouteIsNil() {
        XCTAssertNil(parse("hale://x/foo"))
        XCTAssertNil(parse("hale://settings/open"))
    }

    func testMissingValueIsNil() {
        XCTAssertNil(parse("hale://r/"))   // trailing slash, empty value
        XCTAssertNil(parse("hale://r"))    // route with no value
        XCTAssertNil(parse("hale://"))     // nothing at all
    }
}

final class PremiumResolverTests: XCTestCase {
    func testNoSourceIsNotPremium() {
        XCTAssertFalse(PremiumResolver.hasPlus(rcActive: false, convexPremium: false, referralRewardActive: false))
    }

    func testRevenueCatEntitlementGrantsPremium() {
        XCTAssertTrue(PremiumResolver.hasPlus(rcActive: true, convexPremium: false, referralRewardActive: false))
    }

    func testConvexMirrorGrantsPremium() {
        XCTAssertTrue(PremiumResolver.hasPlus(rcActive: false, convexPremium: true, referralRewardActive: false))
    }

    func testReferralRewardGrantsPremium() {
        XCTAssertTrue(PremiumResolver.hasPlus(rcActive: false, convexPremium: false, referralRewardActive: true))
    }

    func testAnySourceGrantsPremium() {
        XCTAssertTrue(PremiumResolver.hasPlus(rcActive: true, convexPremium: true, referralRewardActive: true))
    }
}
