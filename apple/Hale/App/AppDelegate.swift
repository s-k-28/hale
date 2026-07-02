import UIKit

// Minimal delegate so OneSignal gets launchOptions and all singletons initialize
// once at process start (mirrors the RN root _layout.tsx init block).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        AppServices.launch(launchOptions: launchOptions)
        return true
    }
}

enum AppServices {
    static func launch(launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) {
        SentryService.configure()      // first, to capture any launch errors
        PurchasesService.configure()
        AnalyticsService.configure()
        PushService.configure(launchOptions: launchOptions)
    }
}
