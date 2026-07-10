import SwiftUI

// Referral hub — "Quit together, unlock HALE+ free." Live myProgress + share.
struct ReferralView: View {
    @Environment(AppState.self) private var app
    @State private var progress = LiveQuery<ReferralProgress?>(Fn.myProgress)
    @State private var code: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tok.section) {
                Txt.Eyebrow("Earn free HALE+", color: Tok.warm)
                if !progress.loaded {
                    SkeletonList(rows: 2)
                } else if let p = progress.value ?? nil {
                    if p.rewardActive {
                        VStack(spacing: 18) {
                            // Celebratory reward focal — warm gift glow (Lottie,
                            // gift-medallion fallback). This is the payoff moment.
                            LoopingLottie(name: "reward-unlocked") {
                                Medallion(glyph: .gift, tone: Tok.warm, size: 92)
                            }
                            .frame(width: 180, height: 180)
                            .riseIn(0, distance: 16)
                            CardHero(pad: true) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Badge(label: "Reward unlocked", tone: .warm)
                                    Txt.H2("7 days of HALE+,\non your friends.")
                                    Txt.Body("Full analytics, unlimited Sage, every tool. Free because you brought your people with you. \(p.rewardDaysRemaining) days left.")
                                }
                            }
                        }
                    } else {
                        Txt.H1("Quit together,\nunlock HALE+ free")
                        Card(pad: true) {
                            VStack(alignment: .leading, spacing: 10) {
                                Txt.Body("Invite \(p.target) friends who join HALE and pair up with a buddy.")
                                HStack(spacing: 6) {
                                    ForEach(0..<max(1, p.target), id: \.self) { i in
                                        Capsule().fill(i < p.completedCount ? Tok.warm : Tok.track).frame(height: 8)
                                    }
                                }
                                Txt.Muted(p.completedCount >= p.target
                                          ? "Complete!"
                                          : "\(p.completedCount) of \(p.target) joined & paired · \(max(0, p.target - p.completedCount)) to go")
                            }
                        }
                        if !p.invitees.isEmpty {
                            Card(pad: true) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Txt.Eyebrow("Your invites")
                                    ForEach(Array(p.invitees.enumerated()), id: \.offset) { _, inv in
                                        HStack {
                                            Text(inv.name ?? "Friend").font(.sora(.semibold, 14)).foregroundStyle(Tok.fg)
                                            Spacer()
                                            Text(inv.status == "paired" ? "Paired" : "Joined")
                                                .font(.sora(.medium, 12)).foregroundStyle(inv.status == "paired" ? Tok.warm : Tok.fg3)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if let c = code {
                        ShareLink(item: Links.appStore, message: Text(Links.referralShareText(code: c))) {
                            HButtonLabel(label: "Share my invite link")
                        }.simultaneousGesture(TapGesture().onEnded { AnalyticsService.track(.referralLinkShared, ["surface": "referral_hub"]) })
                        Txt.Muted("Your code: \(c)")
                    }
                } else {
                    BrandEmptyState(
                        glyph: .gift, tone: Tok.warm,
                        title: "Bring your\npeople with you",
                        message: "Share your code. You'll unlock 7 days of HALE+ when 3 friends join and pair up.")
                        .padding(.vertical, 8)
                    if let c = code {
                        ShareLink(item: Links.appStore, message: Text(Links.referralShareText(code: c))) {
                            HButtonLabel(label: "Share my invite link")
                        }.simultaneousGesture(TapGesture().onEnded { AnalyticsService.track(.referralLinkShared, ["surface": "referral_hub"]) })
                    }
                }
            }
            .frame(maxWidth: Tok.maxContent).frame(maxWidth: .infinity)
            .padding(.horizontal, Tok.gutter).padding(.top, Tok.screenTop).padding(.bottom, 40)
        }
        .background(HaleBackdrop())
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
        .task { code = await app.getOrCreateMyCode() }
    }
}
