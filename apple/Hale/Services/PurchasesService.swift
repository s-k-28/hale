import Foundation
import RevenueCat

// Ported from src/lib/revenuecat.ts + paywall.ts. Custom paywall (not RC's UI).
// app_user_id == Convex user _id (the join key for the existing webhook mirror).
enum PurchasesService {
    static func configure() {
        Purchases.logLevel = .warn
        Purchases.configure(withAPIKey: Env.revenueCatKey)
    }

    static func logIn(convexUserId: String) async {
        _ = try? await Purchases.shared.logIn(convexUserId)
    }
    static func logOut() async {
        _ = try? await Purchases.shared.logOut()
    }

    // RC runtime half of usePremium.
    static func hasEntitlement() async -> Bool {
        guard let info = try? await Purchases.shared.customerInfo() else { return false }
        return info.entitlements.active[Env.revenueEntitlement]?.isActive == true
    }

    // Custom paywall offers.
    static func offerPackages() async -> (annual: Package?, monthly: Package?) {
        guard let offerings = try? await Purchases.shared.offerings(),
              let current = offerings.current else { return (nil, nil) }
        return (current.annual, current.monthly)
    }

    @discardableResult
    static func purchase(_ package: Package) async -> Bool {
        guard let result = try? await Purchases.shared.purchase(package: package) else { return false }
        return !result.userCancelled && result.customerInfo.entitlements.active[Env.revenueEntitlement]?.isActive == true
    }

    @discardableResult
    static func restore() async -> Bool {
        guard let info = try? await Purchases.shared.restorePurchases() else { return false }
        return info.entitlements.active[Env.revenueEntitlement]?.isActive == true
    }
}
