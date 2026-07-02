import Foundation
#if canImport(Sentry)
import Sentry
#endif

// Ported from src/lib/sentry.ts. Aggressive scrubbing so health data + Sage chat
// never reach crash payloads. Guarded by canImport so the app still builds when the
// Sentry SPM package is temporarily absent (github binary-artifact download is
// keychain-gated on this machine — re-add the package once authorized).
enum SentryService {
    static func configure() {
        #if canImport(Sentry)
        guard !Env.sentryDSN.isEmpty else { return }
        SentrySDK.start { options in
            options.dsn = Env.sentryDSN
            options.tracesSampleRate = 0.2
            options.sendDefaultPii = false
            options.beforeBreadcrumb = { crumb in
                let dropped: Set<String> = ["http", "xhr", "fetch", "console", "network"]
                if let cat = crumb.category, dropped.contains(cat) { return nil }
                return crumb
            }
            options.beforeSend = { event in
                event.request = nil   // strip URL/headers/body
                return event
            }
        }
        #endif
    }
}
