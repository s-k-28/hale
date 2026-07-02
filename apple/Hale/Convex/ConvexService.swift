import Foundation
import Combine
import ConvexMobile

// Auth response shape (verified live in Phase 0).
struct SignInResponse: Decodable {
    struct Tokens: Decodable { let token: String; let refreshToken: String }
    let tokens: Tokens?
}
struct AnonAuth { let token: String; let refreshToken: String }

enum AuthError: Error { case noTokens, notSignedIn }

// Reproduces @convex-dev/auth/react against the unchanged Anonymous backend:
// auth:signIn {provider:"anonymous"} to sign in, auth:signIn {refreshToken} to
// refresh (rotates), auth:signOut to end. Tokens live in the Keychain (TokenStore).
final class HaleAuthProvider: AuthProvider, @unchecked Sendable {
    typealias T = AnonAuth
    private let authClient: ConvexClient
    private let leewaySeconds: Double = 10

    init(deploymentUrl: String) {
        self.authClient = ConvexClient(deploymentUrl: deploymentUrl)
    }

    func login(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> AnonAuth {
        let resp: SignInResponse = try await authClient.action(
            Fn.signIn, with: ["provider": "anonymous", "params": [String: ConvexEncodable?]()])
        guard let t = resp.tokens else { throw AuthError.noTokens }
        TokenStore.setPair(jwt: t.token, refresh: t.refreshToken)
        onIdToken(t.token)
        return AnonAuth(token: t.token, refreshToken: t.refreshToken)
    }

    func loginFromCache(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> AnonAuth {
        // Use the cached JWT if it's still valid; otherwise refresh via the rotating token.
        if let jwt = TokenStore.jwt, let refresh = TokenStore.refresh, !isExpiringSoon(jwt) {
            onIdToken(jwt)
            return AnonAuth(token: jwt, refreshToken: refresh)
        }
        guard let refresh = TokenStore.refresh else { throw AuthError.notSignedIn }
        let resp: SignInResponse = try await authClient.action(Fn.signIn, with: ["refreshToken": refresh])
        guard let t = resp.tokens else {
            TokenStore.clear(); onIdToken(nil); throw AuthError.noTokens
        }
        TokenStore.setPair(jwt: t.token, refresh: t.refreshToken)   // persist rotated pair
        onIdToken(t.token)
        return AnonAuth(token: t.token, refreshToken: t.refreshToken)
    }

    func logout() async throws {
        try? await authClient.action(Fn.signOut)
        TokenStore.clear()
    }

    func extractIdToken(from authResult: AnonAuth) -> String { authResult.token }

    // JWT exp (seconds) minus leeway < now ⇒ refresh.
    private func isExpiringSoon(_ jwt: String) -> Bool {
        guard let exp = Self.jwtExp(jwt) else { return true }
        return exp - leewaySeconds <= Date().timeIntervalSince1970
    }
    static func jwtExp(_ jwt: String) -> Double? {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let d = Data(base64Encoded: b64),
              let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let exp = obj["exp"] as? Double else { return nil }
        return exp
    }
}

// App-wide Convex client. Screens subscribe via `subscribe(...)` and write via
// `mutation(...)`. `todayState` is the backbone live query (Phase 4 wires stores).
@MainActor
final class ConvexService {
    static let shared = ConvexService(deploymentUrl: Env.convexURL)

    let client: ConvexClientWithAuth<AnonAuth>
    private let provider: HaleAuthProvider

    init(deploymentUrl: String) {
        self.provider = HaleAuthProvider(deploymentUrl: deploymentUrl)
        self.client = ConvexClientWithAuth(deploymentUrl: deploymentUrl, authProvider: provider)
    }

    // Resume a stored session on launch (adopting a legacy RN session if present).
    @discardableResult
    func resume() async -> Bool {
        TokenStore.migrateLegacyIfNeeded(convexURL: Env.convexURL)
        if case .success = await client.loginFromCache() { return true }
        return false
    }

    @discardableResult
    func signInAnonymously() async -> Bool {
        if case .success = await client.login() { return true }
        return false
    }

    func signOut() async { await client.logout() }

    // Typed live subscription → Combine publisher (consume with .values in a .task).
    func subscribe<T: Decodable>(_ name: String, args: [String: ConvexEncodable?]? = nil, as: T.Type = T.self)
        -> AnyPublisher<T, ClientError> {
        client.subscribe(to: name, with: args, yielding: T.self)
    }

    @discardableResult
    func mutation<T: Decodable>(_ name: String, args: [String: ConvexEncodable?]? = nil, as: T.Type = T.self) async throws -> T {
        try await client.mutation(name, with: args)
    }
    func mutationVoid(_ name: String, args: [String: ConvexEncodable?]? = nil) async throws {
        try await client.mutation(name, with: args)
    }

    // One-shot read: subscribe, take the first value, cancel.
    func queryOnce<T: Decodable>(_ name: String, args: [String: ConvexEncodable?]? = nil, as: T.Type = T.self) async -> T? {
        await withCheckedContinuation { cont in
            var cancellable: AnyCancellable?
            var resumed = false
            cancellable = subscribe(name, args: args, as: T.self)
                .sink(receiveCompletion: { _ in
                    if !resumed { resumed = true; cont.resume(returning: nil) }
                }, receiveValue: { v in
                    if !resumed { resumed = true; cont.resume(returning: v); cancellable?.cancel() }
                })
            _ = cancellable
        }
    }
}
