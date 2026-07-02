# Phase 3 — Native services: status & verification gaps

Date: 2026-07-02. Companion to `SWIFT_MIGRATION_PLAN.md` §6.

## What's wired (in `apple/Hale/Services/` + `Convex/`)

| Service | File | State |
|---|---|---|
| Storage (UserDefaults flags) | `Prefs.swift` | Done — all RN AsyncStorage keys, verbatim. Unit-tested. |
| Keychain (auth tokens + RN continuity) | `Convex/Keychain.swift` | Done — `TokenStore` + `migrateLegacyIfNeeded` (adopts an existing expo-secure-store session so updaters keep their identity). |
| Deep links | `DeepLink.swift` | Done — `hale://r/<code>`, `hale://u/<id>`. Unit-tested. |
| Premium resolution | `DeepLink.swift` `PremiumResolver` | Done — RC OR convex mirror OR referral reward. Unit-tested. |
| RevenueCat | `PurchasesService.swift` | **Code done, compiles & links** (pure-source SPM). `configure`, `logIn(convexUserId)`, `hasEntitlement("HALE+")`, `offerPackages`, `purchase`, `restore`. |
| PostHog | `AnalyticsService.swift` | **Code done, compiles & links** (pure-source SPM). `configure`, `identify`, `track(Ev)` with cohort merge, opt-out. Core `Ev` taxonomy; extend per-screen in Phase 4. |
| Sentry | `SentryService.swift` | Code done, **guarded `#if canImport(Sentry)`** — package temporarily omitted (see below). Scrubbers ported. |
| OneSignal | `PushService.swift` | Code done, **guarded `#if canImport(OneSignalFramework)`** — package temporarily omitted. login/tags/click-routing/permission. |
| Launch wiring | `App/AppDelegate.swift` | `AppServices.launch` configures all four at process start. |
| Session identity sync | `Convex/AppState.swift` `syncSession()` | RC logIn + OneSignal login + push tags + PostHog identify + cohort snapshot, fired when `todayState` loads. |

## Blocker: Sentry + OneSignal SPM packages (github binary artifacts)

Both packages download their XCFrameworks from **github.com release assets**. On this machine that download triggers a macOS Keychain ACL prompt ("xcodebuild wants to use confidential information stored in github.com") that cannot be answered in a headless/overnight run, and killing the SecurityAgent is (correctly) blocked as a security-control bypass. Disabling git's credential helper (`GIT_CONFIG_GLOBAL` with empty `credential.helper`) fixes **git** access (RevenueCat/PostHog/Convex now resolve clean) but NOT the artifact downloader.

**To re-enable (one-time, requires the user):** in Xcode or a Terminal build, when the "…github.com…" keychain prompt appears, click **Always Allow** (or run `security set-key-partition-list -S apple-tool:,apple: -s -k <login-pw> ~/Library/Keychains/login.keychain-db` to pre-authorize). Then restore the two packages + deps in `apple/project.yml`:

```yaml
  Sentry:
    url: https://github.com/getsentry/sentry-cocoa
    from: "8.0.0"
  OneSignal:
    url: https://github.com/OneSignal/OneSignal-iOS-SDK
    from: "5.0.0"
# and under target Hale > dependencies:
      - package: Sentry
        product: Sentry
      - package: OneSignal
        product: OneSignalFramework
```

`xcodegen generate` then rebuild — the `#if canImport` guards activate the real Sentry/OneSignal code automatically, no source edits needed.

## Verification gaps (need real credentials / device — cannot be checked headless)

- **RevenueCat sandbox purchase → entitlement flip:** needs a StoreKit sandbox account on a device/simulator with StoreKit config + the real offering. Wiring + webhook (server) already exist; verify `usePremium` flips after a sandbox buy.
- **OneSignal push delivery + click routing:** needs a real device (APNs), the OneSignal app id in env, and the NSE target added (Phase 6). Verify `kind`→route mapping.
- **PostHog events landing:** needs `POSTHOG_KEY` in env (currently read from process env, empty on sim). Verify events + cohort props appear in a dev project.
- **Sentry crash scrubbing:** needs `SENTRY_DSN`; verify health/chat data is scrubbed from a test event.
- **Env keys:** `Env.swift` hardcodes the client-public RC key + convex URLs; OneSignal/PostHog/Sentry keys read from process env (empty on sim → services no-op). Phase 6 moves these to xcconfig per configuration.

## Net
The app builds and runs with RevenueCat + PostHog + Convex active; Sentry + OneSignal are code-complete and one package-add away. None of the four's *functional* verification is possible without device/keys, which is expected for Phase 3 and belongs to a device pass.
