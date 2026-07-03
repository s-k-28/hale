import UserNotifications

#if canImport(OneSignalExtension)
import OneSignalExtension
#endif

// Rich-push service extension. When the OneSignalExtension product is linked
// (see the NSE target's dependencies in project.yml) this hands the request to
// OneSignal so confirmed-delivery, badges, media attachments, and analytics
// work. The #if canImport guard keeps the target building even if the package
// is temporarily removed (falls back to a plain mutable-content passthrough).
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var receivedRequest: UNNotificationRequest!   // set in didReceive before any use (matches OneSignal's sample)
    private var bestAttempt: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.receivedRequest = request
        self.contentHandler = contentHandler
        bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent

        #if canImport(OneSignalExtension)
        if let best = bestAttempt {
            OneSignalExtension.didReceiveNotificationExtensionRequest(
                request, with: best, withContentHandler: contentHandler)
            return
        }
        #endif
        if let best = bestAttempt { contentHandler(best) }
    }

    override func serviceExtensionTimeWillExpire() {
        guard let handler = contentHandler, let best = bestAttempt else { return }
        #if canImport(OneSignalExtension)
        OneSignalExtension.serviceExtensionTimeWillExpireRequest(receivedRequest, with: best)
        #endif
        handler(best)
    }
}
