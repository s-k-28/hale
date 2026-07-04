import Foundation
import Combine
import ConvexMobile

// App-wide session state (mirrors app/index.tsx + (tabs)/_layout PushSync).
// phase drives the root switch; `today` is the backbone live query.
@MainActor
@Observable
final class AppState {
    enum Phase { case loading, onboarding, app }

    private(set) var authed = false
    private(set) var todayLoaded = false
    private(set) var today: TodayState?
    private(set) var booted = false
    private(set) var onboardingInProgress = false   // quiz drives its own post-commit steps
    private(set) var connected = true               // Convex websocket state

    // Show "Reconnecting…" only after we've been live once — never on first launch.
    var reconnecting: Bool { booted && todayLoaded && !connected }

    private let convex = ConvexService.shared
    private var bag = Set<AnyCancellable>()

    // index.tsx gate: loading until auth+first todayState resolve; onboarding if
    // unauthenticated OR onboarded-flag null; else the app.
    var phase: Phase {
        if !booted { return .loading }
        if onboardingInProgress { return .onboarding }   // stay through push/invite steps
        if authed && !todayLoaded { return .loading }
        if !authed || today == nil { return .onboarding }
        return .app
    }

    func finishOnboarding() { onboardingInProgress = false }

    // Deep links (hale://r/<code> resolves to an inviter; hale://u/<id> is direct).
    // Onboarded users pair immediately (with error states); everyone else stashes
    // the inviter so the quiz commit redeems it (deferred attribution). Mirrors u/[id].
    func handleDeepLink(_ url: URL) {
        guard let link = DeepLink.parse(url) else { return }
        Task {
            switch link {
            case .buddyInvite(let id):
                await redeemBuddyInvite(inviterId: id)
            case .referralCode(let code):
                if let r = await convex.queryOnce(Fn.resolveCode, args: ["code": code], as: ResolveCodeResult?.self) ?? nil {
                    await redeemBuddyInvite(inviterId: r.userId)
                }
                // Unknown code → RN silently redirects home; no-op here.
            }
        }
    }

    // Pair now if onboarded; otherwise stash for the quiz commit. Surfaces the
    // exact u/[id] error copy for the caller/inviter-already-paired cases.
    private func redeemBuddyInvite(inviterId: String) async {
        guard authed, let me = today else {
            Prefs.pendingBuddyId = inviterId
            return
        }
        guard inviterId != me.userId else {
            Toast.error("That's your own invite link.")
            return
        }
        do {
            let pair = try await pairWith(inviterId: inviterId, method: "invite_squad")
            AnalyticsService.track(.buddyPaired, ["via": "deep_link", "pairing_method": "invite_squad"])
            if let rid = pair.referrerId {
                AnalyticsService.track(.referralBuddyPaired, ["referrer_id": rid])
                if pair.referralCompleted { AnalyticsService.track(.referralCompleted, ["referrer_id": rid]) }
                if pair.rewardGranted { AnalyticsService.track(.rewardGranted, ["referrer_id": rid, "reward_days": 7]) }
            }
            Toast.success("You're paired up! Find them in the Squad tab.")
        } catch {
            let msg = "\(error)"
            if msg.contains("You already have") {
                Toast.error("You already have a buddy. HALE pairs you with one buddy at a time.")
            } else if msg.contains("They already have") {
                Toast.error("Your friend already has a buddy right now. You can still find your own in the Squad tab.")
            } else {
                Toast.error("That invite link looks invalid or expired. Ask your buddy to send a fresh one.")
            }
        }
    }

    func boot() async {
        // Track the Convex websocket for the reconnecting indicator.
        convex.watchConnection()
            .receive(on: RunLoop.main)
            .sink { [weak self] state in
                switch state {
                case .connected:  self?.connected = true
                case .connecting: self?.connected = false
                @unknown default: break
                }
            }
            .store(in: &bag)

        let resumed = await convex.resume()
        authed = resumed
        if resumed {
            subscribeToday()
        } else if ProcessInfo.processInfo.environment["HALE_AUTOCOMMIT"] == "1" {
            // Debug hook: fast-path to the app for headless screenshots of Today.
            Prefs.ageConfirmed21 = true; Prefs.disclaimerAck = true
            if await signInAnonymously() {
                _ = await completeOnboarding(
                    timezone: TimeZone.current.identifier, productType: "vape",
                    baselinePerDay: 10, unitCost: 0.5, triggers: ["stress", "morning"],
                    hardestHour: 21, motivation: "health", name: "You")
                finishOnboarding()
            }
        }
        booted = true
    }

    // Called at the quiz commit step (deferred sign-up). Keeps phase on onboarding
    // (via onboardingInProgress) so the quiz can run its push/invite steps after commit.
    func signInAnonymously() async -> Bool {
        onboardingInProgress = true
        let ok = await convex.signInAnonymously()
        if ok { authed = true; subscribeToday() }
        return ok
    }

    // Link/sign in with a permanent account. Called with a verified ID token from
    // Sign in with Apple / Google. When the user is currently anonymous the
    // backend links the account to their existing user, so streak/data carry over
    // (the user _id never changes). Re-runs syncSession so RC/analytics identity
    // stays aligned with the (unchanged) user id.
    @discardableResult
    func linkWithApple(idToken: String, name: String?) async -> Bool {
        var params: [String: ConvexEncodable?] = ["idToken": idToken]
        if let name, !name.isEmpty { params["name"] = name }
        let ok = await convex.signIn(provider: "apple", params: params)
        if ok { authed = true; syncSession() }
        return ok
    }

    @discardableResult
    func linkWithGoogle(idToken: String) async -> Bool {
        let ok = await convex.signIn(provider: "google", params: ["idToken": idToken])
        if ok { authed = true; syncSession() }
        return ok
    }

    // Quiz commit (after signInAnonymously). todayState sub then flips phase → .app.
    func completeOnboarding(timezone: String, productType: String, baselinePerDay: Double,
                            unitCost: Double, triggers: [String], hardestHour: Double,
                            motivation: String?, name: String?) async -> String? {
        var args: [String: ConvexEncodable?] = [
            "timezone": timezone, "productType": productType,
            "baselinePerDay": baselinePerDay, "unitCost": unitCost,
            "triggers": triggers as [ConvexEncodable?], "hardestHour": hardestHour,
        ]
        if let m = motivation, !m.isEmpty { args["motivation"] = m }
        if let n = name, !n.isEmpty { args["name"] = n }
        let result: OnboardResult? = try? await convex.mutation(Fn.completeOnboarding, args: args, as: OnboardResult.self)
        return result?.userId
    }

    // Daily check-in. Returns the activation signals (nil on failure → caller toasts).
    func checkIn() async -> CheckInResult? {
        try? await convex.mutation(Fn.checkIn, args: nil, as: CheckInResult.self)
    }

    // Screen mutations (keep ConvexMobile out of views).
    func sendSage(_ content: String) async -> SageSendResult? {
        try? await convex.mutation(Fn.sageSend, args: ["content": content], as: SageSendResult.self)
    }
    func setAiConsent() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.setAiConsent, args: nil) as R }
    func revokeAiConsent() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.revokeAiConsent, args: nil) as R }
    func cheer() async -> Bool { struct R: Decodable {}; do { let _: R = try await convex.mutation(Fn.cheer, args: ["type": "cheer"]); return true } catch { return false } }
    @discardableResult
    func unpair() async -> Bool { struct R: Decodable {}; do { let _: R = try await convex.mutation(Fn.unpair, args: nil); return true } catch { return false } }
    func requestMatch() async -> MatchResult? {
        try? await convex.mutation(Fn.requestMatch, args: nil, as: MatchResult.self)
    }
    func markNudgeRead(_ id: String) async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.markRead, args: ["nudgeId": id]) as R }
    func logCraving(intensity: Int, trigger: String?, context: String?, resolvedBy: String) async {
        struct R: Decodable {}
        var args: [String: ConvexEncodable?] = ["intensity": Double(intensity), "outcome": "survived", "resolvedBy": resolvedBy]
        if let t = trigger { args["trigger"] = t }
        if let c = context { args["context"] = c }
        _ = try? await convex.mutation(Fn.logCraving, args: args) as R
    }
    func logRelapse(kind: String) async -> RelapseResult? {
        try? await convex.mutation(Fn.logRelapse, args: ["kind": kind], as: RelapseResult.self)
    }
    func noteRelapseTrigger(_ trigger: String) async {
        struct R: Decodable {}
        _ = try? await convex.mutation(Fn.noteRelapseTrigger, args: ["trigger": trigger]) as R
    }

    func getOrCreateMyCode() async -> String? {
        (try? await convex.mutation(Fn.getOrCreateMyCode, args: nil, as: CodeResult.self))?.code
    }
    // Welcome-screen code entry (v1 attribution): resolve a 6-char code → inviter id.
    func resolveInviteCode(_ code: String) async -> String? {
        (await convex.queryOnce(Fn.resolveCode, args: ["code": code], as: ResolveCodeResult?.self) ?? nil)?.userId
    }
    @discardableResult
    func attributeInstall(referrerId: String) async -> AttributionResult? {
        try? await convex.mutation(Fn.attributeInstall, args: ["referrerId": referrerId], as: AttributionResult.self)
    }
    // Throws on caller_already_paired / inviter_already_paired so deep-link callers can
    // surface the exact error copy; quiz commit uses `try?` for resilience.
    @discardableResult
    func pairWith(inviterId: String, method: String) async throws -> PairResult {
        try await convex.mutation(Fn.pairWith, args: ["inviterId": inviterId, "pairingMethod": method], as: PairResult.self)
    }
    @discardableResult
    func setGoal(label: String, target: Double) async -> Bool {
        struct R: Decodable {}
        do { let _: R = try await convex.mutation(Fn.setGoal, args: ["label": label, "targetAmount": target]); return true }
        catch { return false }
    }
    @discardableResult
    func deleteGoal(_ id: String) async -> Bool {
        struct R: Decodable {}
        do { let _: R = try await convex.mutation(Fn.deleteGoal, args: ["goalId": id]); return true }
        catch { return false }
    }
    func leagueOptIn() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.leagueOptIn, args: nil) as R }
    func leaveLeague() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.leaveLeague, args: nil) as R }
    @discardableResult
    func joinSquad(code: String) async -> Bool {
        struct R: Decodable {}
        do { let _: R = try await convex.mutation(Fn.joinByCode, args: ["code": code]); return true }
        catch { return false }
    }
    func createSquad(name: String, isPublic: Bool, challengeWeeks: Int?) async -> CreateSquadResult? {
        var args: [String: ConvexEncodable?] = ["name": name, "isPublic": isPublic]
        if let w = challengeWeeks { args["challengeWeeks"] = Double(w) }
        return try? await convex.mutation(Fn.createSquad, args: args, as: CreateSquadResult.self)
    }
    @discardableResult
    func leaveSquad(_ id: String) async -> Bool {
        struct R: Decodable {}
        do { let _: R = try await convex.mutation(Fn.leaveSquad, args: ["squadId": id]); return true }
        catch { return false }
    }
    func deleteAccount() async {
        struct R: Decodable {}
        _ = try? await convex.mutation(Fn.deleteAccount, args: nil) as R
        await PurchasesService.logOut()
        Prefs.clearAll()
        await signOut()
    }

    func signOut() async {
        await convex.signOut()
        bag.removeAll()
        authed = false; today = nil; todayLoaded = false
        WidgetBridge.clear()
    }

    // Post-auth session wiring (RevenueCat/OneSignal identity + push tags + cohort).
    func syncSession() {
        guard let t = today else { return }
        Task { await PurchasesService.logIn(convexUserId: t.userId) }
        PushService.login(externalId: t.userId)
        let hasBuddy = false // set by SquadStore later; tags refined per usePushTags
        PushService.setTags(streak: t.currentStreak, hasBuddy: hasBuddy, hardestHour: t.hardestHour)
        let tier = t.premium ? "paid" : (t.trialActive ? "trial" : "free")
        let stage = Cohort.quitStage(quitStartMs: t.quitStart, nowMs: Date().timeIntervalSince1970 * 1000).rawValue
        AnalyticsService.cohort = [
            "tier": tier, "quit_stage": stage,
            "timezone": t.timezone ?? "", "paired_solo_status": hasBuddy ? "paired" : "solo",
        ]
        AnalyticsService.identify(t.userId)
    }

    private func subscribeToday() {
        convex.subscribe(Fn.todayState, as: TodayState?.self)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { [weak self] value in
                guard let self else { return }
                let firstLoad = !self.todayLoaded
                self.today = value
                self.todayLoaded = true
                if firstLoad || value != nil { self.syncSession() }
                // Keep the widget snapshot + clean-time Live Activity in sync.
                if let v = value { WidgetBridge.publish(v) }
            })
            .store(in: &bag)
    }
}

// Reusable live query for screens: `@State var q = LiveQuery<[SageMessage]>(Fn.sageMessages)`.
@MainActor
@Observable
final class LiveQuery<T: Decodable> {
    private(set) var value: T?
    private(set) var loaded = false
    private var cancellable: AnyCancellable?

    init(_ name: String, args: [String: ConvexEncodable?]? = nil) {
        cancellable = ConvexService.shared.subscribe(name, args: args, as: T.self)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { [weak self] v in
                self?.value = v; self?.loaded = true
            })
    }
}
