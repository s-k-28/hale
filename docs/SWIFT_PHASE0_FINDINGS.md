# Phase 0 — Auth + Continuity Spike Findings

**Status: GATE PASSED — GO. All five §5.2 checks executed green through the real Swift SDK against the live backend.**
Date: 2026-07-02. Executor: Claude Opus. Companion to `SWIFT_MIGRATION_PLAN.md` §5.2.

Disk was freed first (~197 MB → 14 GB, regenerable caches only), which unblocked the build. The spike is a SwiftPM macOS executable at `apple/ConvexSpike/` that links **convex-swift 0.8.1** and drives the real `@convex-dev/auth` Anonymous backend on the **local** dev deployment (`http://127.0.0.1:3210`, `local:local-johnpulavarthy-hale` — not prod). Environment: Xcode 26.6, Swift 6.3; `@convex-dev/auth` 0.0.92; `convex` CLI 1.42.0.

## Gate results (executed)

| §5.2 check | Result | Evidence |
|---|---|---|
| (a) anonymous sign-in | **PASS** | `client.login()` → `HaleAuthProvider.login` calls `auth:signIn {provider:"anonymous"}`, minted RS256 JWT (`aud:"convex"`, 1h exp, `sub=userId\|sessionId`) + refresh token |
| (b) live `users:todayState` subscription | **PASS** | `client.subscribe` emitted `null` initially (user not onboarded) — exactly as predicted |
| (c) reactive update after `completeOnboarding` | **PASS** | subscription flipped `null → object` seconds after the mutation, no manual refetch — the core reactive proof |
| (d) token refresh + rotation | **PASS** | `auth:signIn {refreshToken}` returned a new pair; refresh token **rotated** (verified new ≠ old) |
| (d) cached-session relaunch | **PASS** | a **separate process** seeded with only the stored refresh token → `client.loginFromCache()` minted a JWT for the **same** user; its `todayState` subscription returned `object` (data intact) — this is the continuity mechanism at the SDK level |
| (e) reconnect after network drop | **PASS** | backend killed mid-subscription → `ws: connecting` (auto-retry) → `ws: connected` → re-emitted (emissions #2/#3). Confirms auto-reconnect + the 0.8.0 re-auth-after-reconnect fix works with `HaleAuthProvider` |

The `HaleAuthProvider` in `apple/ConvexSpike/Sources/ConvexSpike/main.swift` is the working reference implementation for Phase 2. Rebuild/run: `cd apple/ConvexSpike && swift build -c release && ./.build/release/ConvexSpike [fresh|resume|reconnect]` (local backend must be up via `npx convex dev`).

The source analysis below (Risk #1 wire protocol, Risk #2 continuity) is now **corroborated by the live run**.

---

## 1. Auth wire protocol (VERIFIED from `@convex-dev/auth@0.0.92` source)

Source: `node_modules/@convex-dev/auth/src/react/client.tsx`, `.../server/implementation/index.ts`.

The React client talks to exactly two public Convex **actions**: `auth:signIn` and `auth:signOut`. The Swift `HaleAuthProvider` must reproduce these three calls.

### Anonymous sign-in
- **Call:** action `auth:signIn`, args `{ provider: "anonymous", params: {}, verifier: undefined }`.
  (client.tsx `signIn()` → `client.authenticatedCall("auth:signIn", { provider, params, verifier })`; for anonymous there's no token yet so it's effectively unauthenticated.)
- **Response:** `{ tokens: { token: string, refreshToken: string } }`.
  (Server `index.ts:425` returns `{ tokens: result.signedIn?.tokens ?? null }` for the `signedIn`/`refreshTokens` cases; OAuth's `{ redirect, verifier }` and `{ started: true }` branches are N/A for Anonymous.)
- **On success:** persist `token` (JWT) and `refreshToken`.

### Token refresh
- **Call:** action `auth:signIn`, args **`{ refreshToken: string }`** — note NOT wrapped in `params`. (client.tsx `verifyCode()`: `"code" in args ? {params:{code},verifier} : args`, and refresh passes `{ refreshToken }` directly.)
- **Response:** `{ tokens: { token, refreshToken } | null }`. `null` ⇒ refresh rejected ⇒ treat as signed out.
- **Rotation:** Convex Auth rotates refresh tokens — the response's `refreshToken` is new. **Always persist the new pair atomically** (write JWT + refresh together; never keep the old refresh token after a successful refresh).

### Sign-out
- **Call:** action `auth:signOut`, no args. Errors are ignored (already-signed-out is fine). Then wipe stored tokens.

### Mapping to `ConvexMobile` `AuthProvider` (0.8.x)
- `login(onIdToken:)`: if no cached tokens → do anonymous sign-in; push `token` via `onIdToken`. If cached → return cached JWT (refresh first if near expiry).
- `loginFromCache()` (also called on WS reconnect): return cached JWT, refreshing via `{ refreshToken }` if expired/near-expiry.
- JWT expiry: decode the JWT `exp` claim to decide "near expiry"; the RN client uses a **10s** refresh leeway (`authRefreshTokenLeewaySeconds ?? 10` in convex client) — match it.
- The `auth:signIn`/`auth:signOut` calls themselves go through the `ConvexClient` action API (unauthenticated for initial sign-in / refresh).

**Sequencing note (matches RN):** immediately after first anonymous sign-in, `users:todayState` is `null` until `users:completeOnboarding` runs. Replicate: sign in → await auth attached → then the onboarding commit calls `completeOnboarding`.

---

## 2. Updater continuity — CAN the native app inherit the existing session? (VERIFIED: yes, source-level; needs one device confirmation)

The current RN app stores the Convex Auth session via `expo-secure-store` with **no options** (`src/app/_layout.tsx` `secureStorage` = bare `getItemAsync/setItemAsync/deleteItemAsync`). That fixes every Keychain attribute:

Source: `node_modules/expo-secure-store@56.0.4/ios/SecureStoreModule.swift` `query(...)`, `SecureStoreOptions.swift`.

| Keychain attribute | Value (because RN passed no options) |
|---|---|
| `kSecClass` | `kSecClassGenericPassword` |
| `kSecAttrService` | `"app"` (`options.keychainService ?? "app"`; no `:auth`/`:no-auth` suffix — `requireAuthentication` was nil) |
| `kSecAttrAccount` | `Data(key.utf8)` — the **UTF-8 bytes** of the namespaced storage key (stored as Data, not a String) |
| `kSecAttrGeneric` | same bytes as account |
| `kSecAttrAccessible` | `kSecAttrAccessibleWhenUnlocked` (SecureStoreOptions default) |
| `kSecAttrAccessGroup` | **not set** ⇒ app's default access group (`$(AppIdentifierPrefix)com.ravipulavarthy.hale`) |

Storage key names (from `client.tsx`: `` `${key}_${escapedNamespace}` ``, `escapedNamespace = address.replace(/[^a-zA-Z0-9]/g,"")`, `address` = the raw Convex URL, verified unmodified in `convex/.../sync/client.js:97`):

- JWT account key: **`__convexAuthJWT_httpsagreeablemongoose741convexcloud`**
- Refresh account key: **`__convexAuthRefreshToken_httpsagreeablemongoose741convexcloud`**

(These assume prod `EXPO_PUBLIC_CONVEX_URL = https://agreeable-mongoose-741.convex.cloud` with no trailing slash — **confirm the exact env string**, since the namespace is byte-exact.)

**Verdict: continuity is achievable.** A native app with the **same bundle id + same Team** shares that default keychain access group, so it can `SecItemCopyMatching` those two `kSecClassGenericPassword` items (service `"app"`, account = `Data(key.utf8)`), read the refresh token, call `auth:signIn {refreshToken}` once to mint a fresh JWT, and adopt the existing anonymous user — **streaks preserved, zero server change.**

Two implementation musts and one caveat:
1. **Query account as `Data`, not `String`.** expo stored `kSecAttrAccount` as raw `Data(key.utf8)`. A Swift query that passes the account as a `String`/`CFString` may not match. Use `Data(key.utf8)`.
2. **Migrate once, then own the session.** On first native launch: read legacy items → refresh → write the session under the native app's own Keychain convention. Don't depend on expo's layout long-term.
3. **Caveat — not device-verified.** This is source-verified, not confirmed against a real Keychain dump from an installed prod build. The namespace must match byte-for-byte; if prod's `EXPO_PUBLIC_CONVEX_URL` differs (trailing slash, different host) the key differs. **Before relying on continuity in a shipping build, confirm on a device that has the current prod app installed and signed in** (dump the two items and match the key strings).

Fallback if continuity ever fails: a small server-side device-migration route (additive; RN untouched) — but source analysis says it shouldn't be needed.

---

## 3. Closed / still open

**Closed by the run:** §5.2 (a)–(e), including refresh-rotation and cached-session relaunch. `HaleAuthProvider` reference implementation exists at `apple/ConvexSpike/`.

**Still open (carry into later phases, not blockers):**
1. **Continuity device check (Risk #2).** §2 is source-verified and the SDK-level resume path is proven, but the *iOS Keychain read of an existing prod session* is not device-tested. Before a shipping build: install the current prod app on a device, sign in, dump the two `kSecClassGenericPassword` items (service `"app"`, accounts = the byte-exact keys in §2) and confirm the native app reads them. Also confirm prod `EXPO_PUBLIC_CONVEX_URL` has no trailing slash (namespace is byte-exact).
2. **iOS (not macOS) SDK run.** The spike ran as a macOS executable — decisive for the SDK/auth/subscription behavior. The Phase 1/2 app target will exercise the same SDK on the iOS simulator; no reason to expect divergence (same XCFramework, iOS 13+).
3. **Phase 0B fallback (custom-JWT) not needed** — the `auth:signIn` path works.

§1 and §2 below are the verified protocol/continuity details for the Phase 2 implementation.
