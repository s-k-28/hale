import Foundation
import UIKit
#if canImport(OneSignalFramework)
import OneSignalFramework
#endif

// Ported from src/lib/onesignal.ts + usePushTags.ts. externalId == Convex user _id.
// Guarded by canImport so the app builds when the OneSignal SPM package is
// temporarily absent (github binary-artifact download is keychain-gated on this
// machine — re-add the package once authorized). Runtime is also key-gated.
enum PushRoute { case today, coach, squad }

#if canImport(OneSignalFramework)
final class PushClickRouter: NSObject, OSNotificationClickListener {
    static let shared = PushClickRouter()
    func onClick(event: OSNotificationClickEvent) {
        let kind = event.notification.additionalData?["kind"] as? String
        let route: PushRoute
        switch kind {
        case "proactive":     route = .coach
        case "buddy_relapse": route = .squad
        default:              route = .today   // nudge / streak_at_risk
        }
        PushService.onOpenRoute?(route)
        AnalyticsService.track(.pushOpened, ["kind": kind ?? "unknown"])
    }
}
#endif

enum PushService {
    static var onOpenRoute: ((PushRoute) -> Void)?
    private static var enabled: Bool { !Env.oneSignalAppId.isEmpty }

    static func configure(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
        #if canImport(OneSignalFramework)
        guard enabled else { return }
        OneSignal.initialize(Env.oneSignalAppId, withLaunchOptions: launchOptions)
        OneSignal.Notifications.addClickListener(PushClickRouter.shared)
        #endif
    }

    static func login(externalId: String) {
        #if canImport(OneSignalFramework)
        guard enabled else { return }
        OneSignal.login(externalId)
        #endif
    }

    static func setTags(streak: Int, hasBuddy: Bool, hardestHour: Int?) {
        #if canImport(OneSignalFramework)
        guard enabled else { return }
        var tags = ["streak": String(streak), "has_buddy": hasBuddy ? "true" : "false"]
        if let h = hardestHour { tags["hardest_hour"] = String(h) }
        OneSignal.User.addTags(tags)
        #endif
    }

    static func requestPermission() {
        #if canImport(OneSignalFramework)
        guard enabled else { return }
        OneSignal.Notifications.requestPermission({ _ in }, fallbackToSettings: true)
        #endif
    }
}
