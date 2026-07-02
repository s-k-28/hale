import SwiftUI

// Referral hub — "Quit together, unlock HALE+ free." Live myProgress + share.
struct ReferralView: View {
    @Environment(AppState.self) private var app
    @State private var progress = LiveQuery<ReferralProgress?>(Fn.myProgress)
    @State private var code: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Txt.Eyebrow("Earn free HALE+", color: Tok.warm)
                if let p = progress.value ?? nil {
                    if p.rewardActive {
                        CardHero(pad: true) {
                            VStack(alignment: .leading, spacing: 8) {
                                Txt.H2("HALE+ unlocked")
                                Txt.Body("\(p.rewardDaysRemaining) days of full access left. You brought \(p.completedCount) friends onto HALE.")
                            }
                        }
                    } else {
                        Txt.H1("Quit together,\nunlock HALE+ free")
                        Card(pad: true) {
                            VStack(alignment: .leading, spacing: 10) {
                                Txt.Body("Invite \(p.target) friends who join HALE and pair up with a buddy.")
                                Track(progress: Double(p.completedCount) / Double(max(1, p.target)), tone: .warm)
                                Txt.Muted("\(p.completedCount) of \(p.target) joined & paired")
                            }
                        }
                    }
                    if let c = code {
                        ShareLink(item: "Quit nicotine with me on HALE. Use my invite code: \(c)") {
                            HButtonLabel(label: "Share my invite link")
                        }.simultaneousGesture(TapGesture().onEnded { AnalyticsService.track(.referralShared, ["surface": "referral_hub"]) })
                    }
                } else {
                    ProgressView().tint(Tok.accent)
                }
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(Tok.bg.ignoresSafeArea())
        .navigationTitle("Invite").navigationBarTitleDisplayMode(.inline)
        .task { code = await app.getOrCreateMyCode() }
    }
}
