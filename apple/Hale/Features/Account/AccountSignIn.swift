import SwiftUI
import AuthenticationServices
import CryptoKit

// Account sign-in — "Save your progress". Native Sign in with Apple (identity
// token) + Google Sign-In (OAuth PKCE id_token). The verified token is sent to
// the backend, which links it to the current anonymous user so streak/data carry
// over (see convex/auth.ts). Deferred signup stays the default: every surface is
// skippable.

// MARK: - Apple (AuthenticationServices, native, no SDK)

/// Native Sign in with Apple button. Hands back the identity token (+ the display
/// name, which Apple only provides on the FIRST authorization).
struct AppleSignInButton: View {
    var onToken: (_ idToken: String, _ name: String?) -> Void
    var onError: (String) -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        SignInWithAppleButton(.continue) { request in
            request.requestedScopes = [.fullName, .email]
        } onCompletion: { result in
            switch result {
            case .success(let auth):
                guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                      let data = cred.identityToken,
                      let token = String(data: data, encoding: .utf8) else {
                    onError("Apple didn't return a token. Please try again.")
                    return
                }
                let name = cred.fullName.flatMap { comps -> String? in
                    guard comps.givenName != nil || comps.familyName != nil else { return nil }
                    return PersonNameComponentsFormatter().string(from: comps)
                }
                onToken(token, name)
            case .failure(let err):
                // User-cancelled is not an error worth surfacing.
                if (err as? ASAuthorizationError)?.code == .canceled { return }
                onError("Couldn't sign in with Apple. Please try again.")
            }
        }
        .signInWithAppleButtonStyle(.white)
        .frame(height: 52)
        .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        .accessibilityLabel("Sign in with Apple")
    }
}

// MARK: - Google (OAuth 2.0 native PKCE via ASWebAuthenticationSession, no SDK)

@MainActor
final class GoogleSignInController: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    /// Runs the Google OAuth PKCE flow and returns the `id_token`, or nil on
    /// cancel/failure/not-configured.
    func signIn() async -> String? {
        guard !Env.googleClientID.isEmpty else { return nil }
        let verifier = Self.randomVerifier()
        let challenge = Self.codeChallenge(verifier)

        var comps = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        comps.queryItems = [
            .init(name: "client_id", value: Env.googleClientID),
            .init(name: "redirect_uri", value: Env.googleRedirectURI),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: "openid email profile"),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
        ]
        guard let authURL = comps.url else { return nil }
        // callbackURLScheme is the reversed-client-id (everything before ":").
        let scheme = String(Env.googleRedirectURI.split(separator: ":").first ?? "")

        let code: String? = await withCheckedContinuation { cont in
            let s = ASWebAuthenticationSession(url: authURL, callbackURLScheme: scheme) { callback, _ in
                guard let callback,
                      let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
                      let code = items.first(where: { $0.name == "code" })?.value else {
                    cont.resume(returning: nil); return
                }
                cont.resume(returning: code)
            }
            s.presentationContextProvider = self
            self.session = s
            s.start()
        }
        guard let code else { return nil }
        return await Self.exchangeCodeForIdToken(code: code, verifier: verifier)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    private static func exchangeCodeForIdToken(code: String, verifier: String) async -> String? {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let form: [String: String] = [
            "code": code,
            "client_id": Env.googleClientID,
            "redirect_uri": Env.googleRedirectURI,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        ]
        req.httpBody = form
            .map { "\($0)=\($1.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? $1)" }
            .joined(separator: "&")
            .data(using: .utf8)
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let idToken = obj["id_token"] as? String else { return nil }
        return idToken
    }

    // PKCE helpers
    private static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 64)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }
    private static func codeChallenge(_ verifier: String) -> String {
        let hash = SHA256.hash(data: Data(verifier.utf8))
        return Data(hash).base64URLEncoded()
    }
}

private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// Google button — hidden entirely until `Env.googleClientID` is provisioned.
struct GoogleSignInButton: View {
    var onToken: (_ idToken: String) -> Void
    var onError: (String) -> Void
    @State private var controller = GoogleSignInController()
    @State private var busy = false

    var body: some View {
        if !Env.googleClientID.isEmpty {
            Button {
                busy = true
                Task {
                    let token = await controller.signIn()
                    busy = false
                    if let token { onToken(token) }
                    else { onError("Couldn't sign in with Google. Please try again.") }
                }
            } label: {
                HStack(spacing: 10) {
                    if busy { ProgressView().tint(Tok.fg) }
                    else { Image(systemName: "g.circle.fill").font(.system(size: 18, weight: .bold)) }
                    Text("Continue with Google").font(.sora(.semibold, 16))
                }
                .foregroundStyle(Tok.fg)
                .frame(maxWidth: .infinity).frame(height: 52)
                .background(Tok.surface2)
                .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(Tok.stroke2, lineWidth: 1))
            }
            .buttonStyle(PressScaleStyle(scale: 0.98))
            .disabled(busy)
            .accessibilityLabel("Sign in with Google")
        }
    }
}

// MARK: - Shared sign-in buttons block (Apple + Google) with link handling

/// The Apple + Google buttons wired to link the account. Calls `onLinked` on a
/// successful link (data preserved), so the caller can advance/dismiss.
struct AccountLinkButtons: View {
    @Environment(AppState.self) private var app
    var onLinked: () -> Void
    @State private var busy = false

    var body: some View {
        VStack(spacing: 12) {
            AppleSignInButton { idToken, name in
                link { await app.linkWithApple(idToken: idToken, name: name) }
            } onError: { Toast.error($0) }

            GoogleSignInButton { idToken in
                link { await app.linkWithGoogle(idToken: idToken) }
            } onError: { Toast.error($0) }
        }
        .opacity(busy ? 0.6 : 1)
        .allowsHitTesting(!busy)
    }

    private func link(_ op: @escaping () async -> Bool) {
        busy = true
        Task {
            let ok = await op()
            busy = false
            if ok { Haptics.success(); Toast.success("Progress saved. You're signed in."); onLinked() }
            else { Toast.error("Sign-in didn't complete. Your progress is safe. Try again.") }
        }
    }
}
