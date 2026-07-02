# Phase 6 — Compliance & Release runbook

Date: 2026-07-02. Companion to `SWIFT_MIGRATION_PLAN.md` §9–§10. The native app is
feature-complete and building green on the simulator. This doc covers the release
artifacts that ARE done, and the exact user-gated steps that remain (signing,
keychain, device verification, TestFlight).

## Done in-repo (building green)

| Item | Where |
|---|---|
| Privacy manifest (App Store required) | `apple/Hale/Resources/PrivacyInfo.xcprivacy` — tracking false; API reasons FileTimestamp C617.1 / UserDefaults CA92.1 / SystemBootTime 35F9.1; collected types Health, OtherUserContent, UserID, DeviceID, ProductInteraction, PurchaseHistory, CrashData (all linked, none tracking). Ported from the RN `app.json` privacyManifests. |
| App entitlements | `apple/Hale/Hale.entitlements` — `aps-environment: production`, app group `group.com.ravipulavarthy.hale.onesignal`. Wired via `CODE_SIGN_ENTITLEMENTS` (ignored on the unsigned sim build). |
| Notification Service Extension | `apple/OneSignalNotificationServiceExtension/` (NotificationService.swift + Info.plist + NSE.entitlements) + target in `project.yml`, embedded in the app. Builds today as a minimal mutable-content handler; OneSignal one-liner marked for when the SDK returns. |
| Info.plist parity | version 2.0, build 10, `ITSAppUsesNonExemptEncryption: false`, portrait, `UIUserInterfaceStyle: Dark`, URL schemes `hale` + bundle id, `UIBackgroundModes: remote-notification`, Sora `UIAppFonts`. |
| TestFlight pipeline | `apple/fastlane/Fastfile` (`beta` lane: xcodegen → build_app → upload_to_testflight) + `Appfile`. |

## App Review parity checklist (all present in the native app)

- [x] **Age gate 21+** (Guideline 2.18) — `AgeGate`, with a respectful under-21 block.
- [x] **Medical disclaimer** (1.4.1) — `NoticeGate` + `DisclaimersView` (You ▸ Disclaimers & sources) listing every health claim's source.
- [x] **Restore purchases** — `PaywallView` "Restore purchases" → `PurchasesService.restore()`.
- [x] **Delete account** (5.1.1(v)) — `DeleteAccountView` two-step arm→confirm → `account:deleteAccount` + external-service detach + local wipe + sign-out.
- [x] **Analytics consent, withdrawable** (5.1.1(ii)) — You ▸ Settings toggle → `AnalyticsService.setOptedOut` (PostHog opt-out), honored at launch.
- [x] **AI-coach data-sharing consent** — Coach consent gate (`aiConsentStatus`/`setAiConsent`); composer locked until agreed; revocable in settings.
- [x] **988 crisis line** — SOS disclaimer, tappable `tel:988`.
- [x] **Community** — flag OFF in v1 (parity with the current build), so no UGC surface ships.
- [x] **No tracking** — PrivacyInfo tracking false; PostHog `disableGeoip`, no IDFA/ATT.

## User-gated steps that remain (cannot be done headless)

1. **Keychain "Always Allow" + re-add Sentry/OneSignal.** In Xcode (or a Terminal build), when the "…github.com…" keychain prompt appears, click **Always Allow**. Then in `apple/project.yml` re-add the two packages + the Hale deps (block in `docs/SWIFT_PHASE3_NOTES.md`), add `OneSignalExtension` as a dependency of the NSE target, and uncomment the OneSignal lines in `NotificationService.swift` + `PushService.swift`/`SentryService.swift` (they're `#if canImport`-guarded, so they light up automatically). `xcodegen generate` && build.
2. **Signing.** Set your Team + provisioning in Xcode signing (or configure fastlane `match`). The APNs entitlement needs a push-enabled profile; the app group must exist in your Apple Developer account.
3. **Env keys for Release.** `apple/Hale/App/Env.swift` has a DEBUG/RELEASE split; the RELEASE branch points at prod Convex + the client-public RC key. Fill `ONESIGNAL_APP_ID` / `POSTHOG_KEY` / `SENTRY_DSN` (currently read from process env; move to an xcconfig or hardcode the client-public values for Release before shipping).
4. **Device verification** (see plan §5.2 / §6): sandbox purchase flips `usePremium`; push delivery + click routing; PostHog events land; Sentry scrubbing.
5. **Updater continuity check (launch-critical).** On a device with the current PROD RN app installed and signed in, confirm the native app reads the legacy Keychain session (`TokenStore.migrateLegacyIfNeeded`) so updaters keep their streak — verify the byte-exact key names in `docs/SWIFT_PHASE0_FINDINGS.md` §2 against the real prod `EXPO_PUBLIC_CONVEX_URL`.
6. **Ship.** `cd apple && bundle exec fastlane beta` → TestFlight; then a phased App Store rollout. Keep the RN app on `main` until the native build is stable in production, then archive it.

## Notes
- Bundle id `com.ravipulavarthy.hale`, ASC app id 6781942293 — same app record (keeps ratings/reviews). Bump build number past the current App Store build before submitting.
- The Convex backend, RevenueCat webhook, OneSignal REST push engine, and crons are all unchanged and already live — no backend work for launch.
