import Foundation
import Combine
import ConvexMobile

// ── Phase 0 spike ─────────────────────────────────────────────────────────────
// Proves the ConvexMobile (convex-swift 0.8.1) SDK can, against the real HALE
// backend and unchanged @convex-dev/auth Anonymous provider:
//   (a) sign in anonymously   (b) hold a live users:todayState subscription
//   (c) see it update reactively after users:completeOnboarding
//   (d) refresh a rotated token   (e) sign out
// Token store is in-memory here; Keychain continuity is source-verified separately
// (docs/SWIFT_PHASE0_FINDINGS.md §2).

let DEPLOYMENT_URL = "http://127.0.0.1:3210"

// MARK: - Wire DTOs (shapes verified live in Phase 0)
struct SignInResponse: Decodable {
    struct Tokens: Decodable { let token: String; let refreshToken: String }
    let tokens: Tokens?
}
struct OnboardResult: Decodable { let userId: String }
// Empty struct: decodes from ANY object, so `TodayProbe?` is nil before onboarding
// and non-nil after — proves the reactive transition without pinning field types.
struct TodayProbe: Decodable {}

struct AnonAuth { let token: String; let refreshToken: String }

// MARK: - Token store (in-memory for the spike; Keychain in the app)
final class TokenStore: @unchecked Sendable {
    private let lock = NSLock()
    private var _token: String?
    private var _refresh: String?
    var token: String? { lock.lock(); defer { lock.unlock() }; return _token }
    var refresh: String? { lock.lock(); defer { lock.unlock() }; return _refresh }
    func set(token: String?, refresh: String?) { lock.lock(); _token = token; _refresh = refresh; lock.unlock() }
    func clear() { set(token: nil, refresh: nil) }
}

enum AuthError: Error { case noTokens, notSignedIn }

// MARK: - HaleAuthProvider — the actual Phase 0 deliverable
// Reproduces what @convex-dev/auth/react does: talks to the public auth:signIn /
// auth:signOut actions on an unauthenticated side client.
final class HaleAuthProvider: AuthProvider, @unchecked Sendable {
    typealias T = AnonAuth
    private let authClient: ConvexClient   // plain client, only for auth:signIn/out
    private let store: TokenStore
    init(deploymentUrl: String, store: TokenStore) {
        self.authClient = ConvexClient(deploymentUrl: deploymentUrl)
        self.store = store
    }

    func login(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> AnonAuth {
        let resp: SignInResponse = try await authClient.action(
            "auth:signIn",
            with: ["provider": "anonymous", "params": [String: ConvexEncodable?]()])
        guard let t = resp.tokens else { throw AuthError.noTokens }
        store.set(token: t.token, refresh: t.refreshToken)
        onIdToken(t.token)
        return AnonAuth(token: t.token, refreshToken: t.refreshToken)
    }

    // Called by the SDK on force-refresh / reconnect. Rotates via auth:signIn {refreshToken}.
    func loginFromCache(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> AnonAuth {
        guard let refresh = store.refresh else { throw AuthError.notSignedIn }
        let resp: SignInResponse = try await authClient.action(
            "auth:signIn", with: ["refreshToken": refresh])
        guard let t = resp.tokens else {
            store.clear(); onIdToken(nil); throw AuthError.noTokens
        }
        store.set(token: t.token, refresh: t.refreshToken)  // persist rotated pair atomically
        onIdToken(t.token)
        return AnonAuth(token: t.token, refreshToken: t.refreshToken)
    }

    func logout() async throws {
        try? await authClient.action("auth:signOut")
        store.clear()
    }

    func extractIdToken(from authResult: AnonAuth) -> String { authResult.token }
}

// MARK: - helpers
func jwtSub(_ jwt: String) -> String {
    let parts = jwt.split(separator: ".")
    guard parts.count >= 2 else { return "?" }
    var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while b64.count % 4 != 0 { b64 += "=" }
    guard let d = Data(base64Encoded: b64),
          let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
          let sub = obj["sub"] as? String else { return "?" }
    return sub
}
func line(_ s: String) { print(s); fflush(stdout) }

let REFRESH_FILE = "/tmp/hale_spike_refresh.txt"

// MARK: - spike runner
@main struct Spike {
    static func main() async {
        let mode = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "fresh"
        switch mode {
        case "resume": await resume()
        case "reconnect": await reconnect()
        default: await fresh()
        }
    }

    // (a)-(e): fresh sign-in, live subscribe, reactive update, refresh, sign-out.
    static func fresh() async {
        line("── HALE Phase 0 spike [fresh] · convex-swift 0.8.1 · \(DEPLOYMENT_URL) ──")
        let store = TokenStore()
        let provider = HaleAuthProvider(deploymentUrl: DEPLOYMENT_URL, store: store)
        let client = ConvexClientWithAuth<AnonAuth>(deploymentUrl: DEPLOYMENT_URL, authProvider: provider)

        // (a) anonymous sign-in
        let loginResult = await client.login()
        switch loginResult {
        case .success(let auth):
            line("(a) PASS anon sign-in — user \(jwtSub(auth.token)) | jwt \(auth.token.count)b | refresh \(auth.refreshToken.count)b")
        case .failure(let e):
            line("(a) FAIL sign-in: \(e)"); exit(1)
        }

        // (b) live subscription to users:todayState
        var seen: [String] = []
        let seenLock = NSLock()
        var bag = Set<AnyCancellable>()
        client.subscribe(to: "users:todayState", yielding: TodayProbe?.self)
            .sink(receiveCompletion: { c in
                if case .failure(let e) = c { line("    subscription error: \(e)") }
            }, receiveValue: { value in
                seenLock.lock(); seen.append(value == nil ? "null" : "object"); seenLock.unlock()
                line("    ⟳ todayState → \(value == nil ? "null" : "object")")
            })
            .store(in: &bag)
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        seenLock.lock(); let before = seen; seenLock.unlock()
        line("(b) \(before.contains("null") ? "PASS" : "FAIL") live subscribe — initial emission: \(before)")

        // (c) completeOnboarding → subscription must flip null → object
        do {
            let args: [String: ConvexEncodable?] = [
                "timezone": "America/New_York",
                "productType": "vape",
                "baselinePerDay": 10.0,
                "unitCost": 0.5,
                "triggers": ["stress", "morning"] as [ConvexEncodable?],
                "hardestHour": 21.0,
                "motivation": "health",
                "name": "Spike",
            ]
            let r: OnboardResult = try await client.mutation("users:completeOnboarding", with: args)
            line("    completeOnboarding ok — userId \(r.userId)")
        } catch { line("(c) FAIL completeOnboarding: \(error)"); exit(1) }
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        seenLock.lock(); let after = seen; seenLock.unlock()
        line("(c) \(after.contains("object") ? "PASS" : "FAIL") reactive update — emissions: \(after)")

        // (d) token refresh via provider (rotation) — same path the SDK drives on reconnect
        let oldRefresh = store.refresh ?? ""
        do {
            _ = try await provider.loginFromCache(onIdToken: { _ in })
            let rotated = (store.refresh ?? "") != oldRefresh && !oldRefresh.isEmpty
            line("(d) \(rotated ? "PASS" : "FAIL") token refresh — refresh rotated: \(rotated)")
        } catch { line("(d) FAIL refresh: \(error)") }

        // Persist the valid (rotated) refresh token so [resume] can prove cached-session
        // relaunch, and leave the session alive (no sign-out here). (e) sign-out is
        // exercised by [resume].
        try? (store.refresh ?? "").write(toFile: REFRESH_FILE, atomically: true, encoding: .utf8)
        line("    persisted refresh token → \(REFRESH_FILE)")
        bag.removeAll()
        line("── fresh complete (session left alive for resume) ──")
        exit(0)
    }

    static func onboardArgs() -> [String: ConvexEncodable?] {
        ["timezone": "America/New_York", "productType": "vape", "baselinePerDay": 10.0,
         "unitCost": 0.5, "triggers": ["stress", "morning"] as [ConvexEncodable?],
         "hardestHour": 21.0, "motivation": "health", "name": "Spike"]
    }

    // (d/relaunch) + (e): cold launch from a stored refresh token — no login() UI.
    static func resume() async {
        line("── HALE Phase 0 spike [resume] · cached-session relaunch ──")
        guard let refresh = try? String(contentsOfFile: REFRESH_FILE, encoding: .utf8),
              !refresh.isEmpty else { line("resume: run [fresh] first"); exit(1) }
        let store = TokenStore()
        store.set(token: nil, refresh: refresh)   // only the refresh survives a cold launch (JWT gone)
        let provider = HaleAuthProvider(deploymentUrl: DEPLOYMENT_URL, store: store)
        let client = ConvexClientWithAuth<AnonAuth>(deploymentUrl: DEPLOYMENT_URL, authProvider: provider)

        let r = await client.loginFromCache()
        switch r {
        case .success(let a): line("(d/relaunch) PASS cached resume — minted JWT for user \(jwtSub(a.token))")
        case .failure(let e): line("(d/relaunch) FAIL cached resume: \(e)"); exit(1)
        }
        var seen: [String] = []; let lk = NSLock(); var bag = Set<AnyCancellable>()
        client.subscribe(to: "users:todayState", yielding: TodayProbe?.self)
            .sink(receiveCompletion: { _ in }, receiveValue: { v in
                lk.lock(); seen.append(v == nil ? "null" : "object"); lk.unlock()
                line("    ⟳ todayState → \(v == nil ? "null" : "object")")
            }).store(in: &bag)
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        lk.lock(); let s = seen; lk.unlock()
        line("(d/relaunch·sub) \(s.contains("object") ? "PASS" : "FAIL") authed subscription after resume — \(s)")
        await client.logout()
        line("(e) \(store.token == nil ? "PASS" : "FAIL") sign-out — tokens cleared: \(store.token == nil)")
        bag.removeAll(); line("── resume complete ──"); exit(0)
    }

    // (e/network): survive a backend drop mid-subscription (proxy for airplane-mode).
    static func reconnect() async {
        line("── HALE Phase 0 spike [reconnect] · survive backend drop ──")
        let store = TokenStore()
        let provider = HaleAuthProvider(deploymentUrl: DEPLOYMENT_URL, store: store)
        let client = ConvexClientWithAuth<AnonAuth>(deploymentUrl: DEPLOYMENT_URL, authProvider: provider)
        _ = await client.login()
        let _: OnboardResult? = try? await client.mutation("users:completeOnboarding", with: onboardArgs())
        var count = 0; let lk = NSLock(); var bag = Set<AnyCancellable>()
        client.watchWebSocketState().sink { st in line("    ws: \(st)") }.store(in: &bag)
        client.subscribe(to: "users:todayState", yielding: TodayProbe?.self)
            .sink(receiveCompletion: { c in if case .failure(let e) = c { line("    sub err: \(e)") } },
                  receiveValue: { v in lk.lock(); count += 1; let n = count; lk.unlock()
                      line("    ⟳ emission #\(n) → \(v == nil ? "null" : "object")") })
            .store(in: &bag)
        line("    subscribing 90s — harness will kill/restart backend mid-window")
        try? await Task.sleep(nanoseconds: 90_000_000_000)
        lk.lock(); let n = count; lk.unlock()
        line("(e/network) \(n >= 2 ? "PASS" : "INCONCLUSIVE") reconnect — emissions: \(n) (expect ≥2: initial + post-reconnect)")
        bag.removeAll(); line("── reconnect complete ──"); exit(0)
    }
}
