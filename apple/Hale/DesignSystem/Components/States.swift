import SwiftUI
import Combine

// Reusable loading / empty / error / toast primitives (Part B robustness).
// Every live-query screen uses these instead of a bare ProgressView.

// MARK: - Toast (sonner-native parity: top-inserted, auto-dismiss 2.5s, swipe up)

@MainActor
@Observable
final class ToastCenter {
    static let shared = ToastCenter()
    private init() {}

    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let message: String
        let kind: Kind
        enum Kind { case success, error, info }
    }

    private(set) var current: Toast?
    private var dismissTask: Task<Void, Never>?

    func success(_ message: String) { show(.init(message: message, kind: .success)) }
    func error(_ message: String)   { show(.init(message: message, kind: .error)) }
    func info(_ message: String)    { show(.init(message: message, kind: .info)) }

    private func show(_ toast: Toast) {
        current = toast
        Haptics.tap()
        dismissTask?.cancel()
        dismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.2)) { self?.current = nil }
        }
    }

    func dismiss() {
        dismissTask?.cancel()
        withAnimation(.easeOut(duration: 0.2)) { current = nil }
    }
}

/// Global convenience so call sites read like RN's `Toast.success(...)`.
enum Toast {
    @MainActor static func success(_ m: String) { ToastCenter.shared.success(m) }
    @MainActor static func error(_ m: String)   { ToastCenter.shared.error(m) }
    @MainActor static func info(_ m: String)     { ToastCenter.shared.info(m) }
}

/// Root overlay — attach once near the app root via `.toastHost()`.
struct ToastHost: ViewModifier {
    @State private var center = ToastCenter.shared
    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let t = center.current {
                toastView(t)
                    .padding(.horizontal, Tok.gutter)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .gesture(DragGesture().onEnded { v in
                        if v.translation.height < -20 { center.dismiss() }
                    })
                    .animation(.spring(response: 0.35, dampingFraction: 0.8), value: center.current)
            }
        }
    }

    private func toastView(_ t: ToastCenter.Toast) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon(t.kind)).font(.system(size: 15, weight: .bold))
                .foregroundStyle(tint(t.kind))
            Text(t.message).font(.sora(.semibold, 14)).foregroundStyle(Tok.fg)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(Tok.surface2, in: RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(Tok.stroke2, lineWidth: 1))
        .shadow(color: .black.opacity(0.35), radius: 18, y: 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(t.message)
    }

    private func icon(_ k: ToastCenter.Toast.Kind) -> String {
        switch k { case .success: return "checkmark.circle.fill"; case .error: return "exclamationmark.triangle.fill"; case .info: return "info.circle.fill" }
    }
    private func tint(_ k: ToastCenter.Toast.Kind) -> Color {
        switch k { case .success: return Tok.accent; case .error: return Tok.coral; case .info: return Tok.fg2 }
    }
}

extension View {
    func toastHost() -> some View { modifier(ToastHost()) }
}

// MARK: - Skeletons (shimmer; static under Reduce Motion)

struct SkeletonBlock: View {
    var height: CGFloat = 16
    var width: CGFloat? = nil
    var radius: CGFloat = Tok.R.inset
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Tok.surface2)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
            .overlay {
                if !reduceMotion {
                    TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
                        GeometryReader { geo in
                            let period = 1.4
                            let t = tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
                            LinearGradient(colors: [.clear, Tok.hi, .clear], startPoint: .leading, endPoint: .trailing)
                                .frame(width: geo.size.width * 0.5)
                                .offset(x: -geo.size.width * 0.5 + geo.size.width * 1.5 * t)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                }
            }
            .accessibilityHidden(true)
    }
}

/// Vertical stack of skeleton lines — a generic "content is loading" placeholder.
struct SkeletonList: View {
    var rows: Int = 3
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(0..<rows, id: \.self) { i in
                VStack(alignment: .leading, spacing: 8) {
                    SkeletonBlock(height: 14, width: i.isMultiple(of: 2) ? nil : 180)
                    SkeletonBlock(height: 12, width: 120)
                }
            }
        }
    }
}

// MARK: - Empty & Error states

struct EmptyStateView: View {
    var icon: String? = nil
    let title: String
    var message: String? = nil
    var body: some View {
        VStack(spacing: 10) {
            if let icon { Image(systemName: icon).font(.system(size: 30, weight: .regular)).foregroundStyle(Tok.fg3) }
            Txt.H3(title)
            if let message { Txt.Body(message).multilineTextAlignment(.center) }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .accessibilityElement(children: .combine)
    }
}

struct ErrorStateView: View {
    var message: String = "Something went wrong. Check your connection and try again."
    var retry: (() -> Void)? = nil
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark").font(.system(size: 28, weight: .regular)).foregroundStyle(Tok.fg3)
            Txt.Body(message).multilineTextAlignment(.center)
            if let retry {
                HButton(label: "Try again", variant: .secondary, sm: true, action: retry)
                    .fixedSize()
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}

// MARK: - Reconnecting indicator (Convex websocket state)

/// Subtle top pill shown while the Convex socket is reconnecting. Driven by
/// AppState.reconnecting (watchWebSocketState). Not shown on the very first connect.
struct ReconnectBanner: View {
    let reconnecting: Bool
    var body: some View {
        if reconnecting {
            HStack(spacing: 8) {
                ProgressView().controlSize(.mini).tint(Tok.warm)
                Text("Reconnecting…").font(.sora(.semibold, 12)).foregroundStyle(Tok.fg2)
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Tok.surface2, in: Capsule())
            .overlay(Capsule().strokeBorder(Tok.stroke2, lineWidth: 1))
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityLabel("Reconnecting to the server")
        }
    }
}
