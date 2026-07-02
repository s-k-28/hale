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
    // Stash the inviter so the quiz commit redeems it (deferred attribution).
    func handleDeepLink(_ url: URL) {
        guard let link = DeepLink.parse(url) else { return }
        Task {
            switch link {
            case .buddyInvite(let id):
                Prefs.pendingBuddyId = id
            case .referralCode(let code):
                if let r = await convex.queryOnce(Fn.resolveCode, args: ["code": code], as: ResolveCodeResult?.self) ?? nil {
                    Prefs.pendingBuddyId = r.userId
                }
            }
        }
    }

    func boot() async {
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

    // Daily check-in (returns an object → decode permissively, ignore fields for now).
    @discardableResult
    func checkIn() async -> Bool {
        struct R: Decodable {}
        do { let _: R = try await convex.mutation(Fn.checkIn, args: nil); return true }
        catch { return false }
    }

    // Screen mutations (keep ConvexMobile out of views).
    func sendSage(_ content: String) async -> SageSendResult? {
        try? await convex.mutation(Fn.sageSend, args: ["content": content], as: SageSendResult.self)
    }
    func setAiConsent() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.setAiConsent, args: nil) as R }
    func revokeAiConsent() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.revokeAiConsent, args: nil) as R }
    func cheer() async -> Bool { struct R: Decodable {}; do { let _: R = try await convex.mutation(Fn.cheer, args: ["type": "cheer"]); return true } catch { return false } }
    func unpair() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.unpair, args: nil) as R }
    func requestMatch() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.requestMatch, args: nil) as R }
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
    func attributeInstall(referrerId: String) async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.attributeInstall, args: ["referrerId": referrerId]) as R }
    func pairWith(inviterId: String, method: String) async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.pairWith, args: ["inviterId": inviterId, "pairingMethod": method]) as R }
    func setGoal(label: String, target: Double) async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.setGoal, args: ["label": label, "targetAmount": target]) as R }
    func deleteGoal(_ id: String) async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.deleteGoal, args: ["goalId": id]) as R }
    func leagueOptIn() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.leagueOptIn, args: nil) as R }
    func leaveLeague() async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.leaveLeague, args: nil) as R }
    func joinSquad(code: String) async { struct R: Decodable {}; _ = try? await convex.mutation(Fn.joinByCode, args: ["code": code]) as R }
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
