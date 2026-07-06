import SwiftUI

// Root switch (mirrors app/index.tsx gate) + tab bar. SOS & Paywall are
// full-screen covers presented from within.
struct RootRouter: View {
    @State private var app = AppState()
    @State private var splashDone = false

    var body: some View {
        ZStack {
            HaleBackdrop()
            switch app.phase {
            case .loading:    LoadingView()
            case .onboarding: OnboardingFlow()
            case .app:        MainTabs()
            }
        }
        .overlay(alignment: .top) {
            ReconnectBanner(reconnecting: app.reconnecting)
                .padding(.top, 4)
                .animation(.spring(response: 0.35, dampingFraction: 0.85), value: app.reconnecting)
        }
        .overlay { if !splashDone { SplashView().transition(.opacity) } }
        .toastHost()
        .environment(app)
        .task {
            let start = Date()
            await app.boot()
            // Let the intro breathe for a beat even when resume is instant.
            let elapsed = Date().timeIntervalSince(start)
            if elapsed < 1.1 { try? await Task.sleep(for: .seconds(1.1 - elapsed)) }
            withAnimation(.easeOut(duration: 0.55)) { splashDone = true }
        }
        .onOpenURL { app.handleDeepLink($0) }
        .animation(.easeInOut(duration: 0.25), value: app.phase)
    }
}

extension AppState.Phase: Equatable {}

struct LoadingView: View {
    var body: some View {
        ZStack {
            HaleBackdrop()
            ProgressView().tint(Tok.accent)
        }
    }
}

struct MainTabs: View {
    @State private var selection = Int(ProcessInfo.processInfo.environment["HALE_TAB"] ?? "0") ?? 0

    // No UITabBarAppearance override: on iOS 26 the bar auto-adopts Liquid
    // Glass — content refracts beneath it, and the emerald tint rides on top.

    var body: some View {
        TabView(selection: $selection) {
            TabCrossfade(tag: 0, selection: selection) { TodayView() }
                .tag(0).tabItem { Label("Today", systemImage: "house.fill") }
            TabCrossfade(tag: 1, selection: selection) { SquadView() }
                .tag(1).tabItem { Label("Squad", systemImage: "person.2.fill") }
            if FeatureFlags.community {
                TabCrossfade(tag: 2, selection: selection) { CommunityTabView() }
                    .tag(2).tabItem { Label("Community", systemImage: "heart.circle.fill") }
            }
            TabCrossfade(tag: 3, selection: selection) { CoachView() }
                .tag(3).tabItem { Label("Coach", systemImage: "message.fill") }
            TabCrossfade(tag: 4, selection: selection) { YouView() }
                .tag(4).tabItem { Label("You", systemImage: "person.fill") }
        }
        .tint(Tok.accent)
        // iOS 26 Liquid Glass bar: shrink to a compact pill while scrolling so
        // content owns the screen, re-expand on scroll-up.
        .tabBarMinimizeBehavior(.onScrollDown)
        .onChange(of: selection) { _, _ in Haptics.select() }
        .task {
            // DEBUG screenshot hook: HALE_TABSWITCH="4@3" switches to tab 4 after
            // 3s so the cross-fade can be captured headless (locked-screen sims).
            #if DEBUG
            if let spec = ProcessInfo.processInfo.environment["HALE_TABSWITCH"] {
                let parts = spec.split(separator: "@")
                if parts.count == 2, let tag = Int(parts[0]), let delay = Double(parts[1]) {
                    try? await Task.sleep(for: .seconds(delay))
                    selection = tag
                }
            }
            #endif
        }
    }
}

// Calm 220ms cross-fade when a tab becomes current — the default instant swap
// reads as a jolt against HALE's slow backdrop. Fades the incoming tab in over
// the shared HaleBackdrop (which never moves), so the switch reads as one
// continuous space changing contents, never a slide. Reduce Motion: instant.
private struct TabCrossfade<Content: View>: View {
    let tag: Int
    let selection: Int
    @ViewBuilder var content: Content
    @State private var shown = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        content
            .opacity(shown ? 1 : 0)
            .onChange(of: selection) { _, now in
                guard now == tag, !reduceMotion else { return }
                shown = false
                withAnimation(.easeInOut(duration: 0.22)) { shown = true }
            }
    }
}
