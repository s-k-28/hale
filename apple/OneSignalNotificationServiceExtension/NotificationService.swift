import UserNotifications

// Rich-push service extension. Builds standalone today; when the OneSignal SPM
// package is re-added (after the keychain "Always Allow"), replace the body with
// the OneSignal handler (one line, marked below) and add `OneSignalExtension` as a
// dependency of this target in project.yml.
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent
        // When OneSignal is re-added:
        //   OneSignalExtension.didReceiveNotificationExtensionRequest(request, with: bestAttempt, withContentHandler: contentHandler)
        //   return
        if let best = bestAttempt { contentHandler(best) }
    }

    override func serviceExtensionTimeWillExpire() {
        if let handler = contentHandler, let best = bestAttempt {
            // When OneSignal is re-added:
            //   OneSignalExtension.serviceExtensionTimeWillExpireRequest(request, with: bestAttempt)
            handler(best)
        }
    }
}
