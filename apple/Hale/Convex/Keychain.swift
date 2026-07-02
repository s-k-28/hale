import Foundation
import Security

// Generic Keychain access (kSecClassGenericPassword). Accounts are stored as Data
// (UTF-8 bytes) — this matches how expo-secure-store writes, which is what lets us
// read an existing RN session for updater continuity (see TokenStore.migrateLegacy).
enum Keychain {
    @discardableResult
    static func save(service: String, account: Data, value: String) -> Bool {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    static func read(service: String, account: Data) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(service: String, account: Data) {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(q as CFDictionary)
    }
}

// The Convex Auth session (JWT + refresh token) in the app's own Keychain service,
// with one-time adoption of a pre-existing RN (expo-secure-store) session so that
// users updating from the React Native build keep their anonymous identity & streak.
enum TokenStore {
    private static let service = "com.ravipulavarthy.hale.convexauth"
    private static let jwtAccount = Data("jwt".utf8)
    private static let refreshAccount = Data("refresh".utf8)

    static var jwt: String? { Keychain.read(service: service, account: jwtAccount) }
    static var refresh: String? { Keychain.read(service: service, account: refreshAccount) }

    static func setPair(jwt: String, refresh: String) {
        Keychain.save(service: service, account: jwtAccount, value: jwt)
        Keychain.save(service: service, account: refreshAccount, value: refresh)
    }
    static func clear() {
        Keychain.delete(service: service, account: jwtAccount)
        Keychain.delete(service: service, account: refreshAccount)
    }

    // Continuity (Phase 0 §2): expo-secure-store wrote with service "app" and
    // account = UTF-8 bytes of "__convexAuthRefreshToken_<escapedNamespace>", where
    // namespace is the Convex URL with non-alphanumerics stripped. Adopt it once.
    @discardableResult
    static func migrateLegacyIfNeeded(convexURL: String) -> Bool {
        guard refresh == nil else { return false }   // already have our own session
        let ns = convexURL.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }
            .map(String.init).joined()
        let legacyRefreshKey = "__convexAuthRefreshToken_\(ns)"
        let legacyJwtKey = "__convexAuthJWT_\(ns)"
        guard let legacyRefresh = Keychain.read(service: "app", account: Data(legacyRefreshKey.utf8)) else {
            return false
        }
        let legacyJwt = Keychain.read(service: "app", account: Data(legacyJwtKey.utf8)) ?? ""
        setPair(jwt: legacyJwt, refresh: legacyRefresh)
        return true
    }
}
