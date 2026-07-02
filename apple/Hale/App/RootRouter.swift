import SwiftUI

// Root switch (mirrors app/index.tsx gate) + tab bar. SOS & Paywall are
// full-screen covers presented from within.
struct RootRouter: View {
    @State private var app = AppState()

    var body: some View {
        ZStack {
            Tok.bg.ignoresSafeArea()
            switch app.phase {
            case .loading:    LoadingView()
            case .onboarding: OnboardingFlow()
            case .app:        MainTabs()
            }
        }
        .environment(app)
        .task { await app.boot() }
        .onOpenURL { app.handleDeepLink($0) }
        .animation(.easeInOut(duration: 0.25), value: app.phase)
    }
}

extension AppState.Phase: Equatable {}

struct LoadingView: View {
    var body: some View {
        ZStack {
            Tok.bg.ignoresSafeArea()
            ProgressView().tint(Tok.accent)
        }
    }
}

struct MainTabs: View {
    @State private var selection = Int(ProcessInfo.processInfo.environment["HALE_TAB"] ?? "0") ?? 0

    init() {
        let a = UITabBarAppearance()
        a.configureWithOpaqueBackground()
        a.backgroundColor = UIColor(Tok.bg)
        a.shadowColor = UIColor(Tok.stroke)
        UITabBar.appearance().standardAppearance = a
        UITabBar.appearance().scrollEdgeAppearance = a
    }

    var body: some View {
        TabView(selection: $selection) {
            TodayView()
                .tag(0).tabItem { Label("Today", systemImage: "house.fill") }
            SquadView()
                .tag(1).tabItem { Label("Squad", systemImage: "person.2.fill") }
            if FeatureFlags.community {
                CommunityTabView()
                    .tag(2).tabItem { Label("Community", systemImage: "heart.circle.fill") }
            }
            CoachView()
                .tag(3).tabItem { Label("Coach", systemImage: "message.fill") }
            YouView()
                .tag(4).tabItem { Label("You", systemImage: "person.fill") }
        }
        .tint(Tok.accent)
    }
}
