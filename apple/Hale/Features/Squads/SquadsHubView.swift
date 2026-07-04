import SwiftUI

// Squads hub — your squads, join-by-code, and create (1-squad free limit gated by
// LockedFeature). Public discovery stays flag-off in v1.
struct SquadsHubView: View {
    @Environment(AppState.self) private var app
    @State private var squads = LiveQuery<[Squad]>(Fn.mySquads)
    @State private var joinCode = ""
    @State private var newName = ""
    @State private var isPublic = false
    @State private var startChallenge = true
    @State private var creating = false
    @State private var createdCode: String?
    @State private var showPaywall = false

    private var premium: Bool { app.today?.hasHALEPlus ?? false }
    private var mine: [Squad] { squads.value ?? [] }
    // Free tier: one squad. Gate create once they're already in one.
    private var createLocked: Bool { !premium && !mine.isEmpty }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tok.section) {
                Txt.Eyebrow("Quit together", color: Tok.accent)
                Txt.H1("Squads")
                Txt.Body("Pick a group going through the same thing. Start a 6-week challenge and keep each other honest.")

                // Content first: your squads lead; join / create are demoted below.
                if !squads.loaded {
                    SkeletonList(rows: 2)
                } else if mine.isEmpty {
                    BrandEmptyState(
                        glyph: .squad,
                        title: "Better in\na group",
                        message: "Join a squad with an invite code below, or start your own and take on a 6-week challenge together.")
                        .padding(.top, 12)
                } else {
                    ForEach(mine) { s in squadCard(s) }
                }

                joinCard
                createCard
            }
            .frame(maxWidth: Tok.maxContent).frame(maxWidth: .infinity)
            .padding(.horizontal, Tok.gutter).padding(.top, Tok.screenTop).padding(.bottom, 40)
        }
        .background(HaleBackdrop())
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "squads") }
    }

    private var joinCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 10) {
                Txt.H3("Join by code")
                Input(text: $joinCode, placeholder: "CODE")
                HButton(label: "Join", variant: .primary, sm: true, disabled: joinCode.isEmpty) {
                    Task {
                        if await app.joinSquad(code: joinCode) {
                            AnalyticsService.track(.squadJoined, ["method": "code"])
                            joinCode = ""; Haptics.success(); Toast.success("Joined the squad.")
                        } else {
                            Toast.error("That code didn't work. Double-check it and try again.")
                        }
                    }
                }
            }
        }
    }

    private var createCard: some View {
        LockedFeature(feature: "extra_squad", variant: .inline,
                      title: "One squad on the free plan",
                      subtitle: "Upgrade to HALE+ to start or join more squads.",
                      locked: createLocked, onTap: { showPaywall = true }) {
            Card(pad: true) {
                VStack(alignment: .leading, spacing: 12) {
                    Txt.H3("Start a squad")
                    Input(text: $newName, placeholder: "Squad name")
                    Toggle(isOn: $startChallenge) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("6-week challenge").font(.sora(.semibold, 14)).foregroundStyle(Tok.fg)
                            Text("Everyone races to the most clean days.").font(.sora(.regular, 12)).foregroundStyle(Tok.fg2)
                        }
                    }.tint(Tok.accent)
                    Toggle(isOn: $isPublic) {
                        Text("Discoverable").font(.sora(.semibold, 14)).foregroundStyle(Tok.fg)
                    }.tint(Tok.accent)
                    HButton(label: "Create squad", variant: .secondary, sm: true, loading: creating,
                            disabled: newName.trimmingCharacters(in: .whitespaces).isEmpty) {
                        Task { await create() }
                    }
                    if let c = createdCode {
                        HStack {
                            Txt.Muted("Invite code: \(c)")
                            Spacer()
                            ShareLink(item: Links.appStore, message: Text(Links.buddyShareText(code: c))) {
                                Text("Share").font(.sora(.semibold, 13)).foregroundStyle(Tok.accent)
                            }.simultaneousGesture(TapGesture().onEnded {
                                AnalyticsService.track(.squadInvited, ["surface": "squads_hub_create"])
                            })
                        }
                    }
                }
            }
        }
    }

    private func create() async {
        creating = true
        defer { creating = false }
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard let res = await app.createSquad(name: name, isPublic: isPublic, challengeWeeks: startChallenge ? 6 : nil) else {
            Toast.error("Couldn't create the squad. Try again.")
            return
        }
        AnalyticsService.track(.squadCreated, ["isPublic": isPublic, "startChallenge": startChallenge])
        createdCode = res.inviteCode
        newName = ""; Haptics.success(); Toast.success("Squad created.")
    }

    private func squadCard(_ s: Squad) -> some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Txt.H3(s.name)
                    Spacer()
                    if s.role == "owner" { Badge(label: "Owner", tone: .soft) }
                }
                Txt.Body("\(s.memberCount) member\(s.memberCount == 1 ? "" : "s")")
                if let end = s.challengeEnd, let goal = s.challengeGoalDays {
                    challengeProgress(end: end, goalDays: goal)
                }
                HStack(spacing: 14) {
                    ShareLink(item: Links.appStore, message: Text(Links.buddyShareText(code: s.inviteCode))) {
                        Text("Share code").font(.sora(.semibold, 13)).foregroundStyle(Tok.accent)
                    }.simultaneousGesture(TapGesture().onEnded {
                        AnalyticsService.track(.squadInvited, ["surface": "squads_hub", "squadId": s.id])
                    })
                    Spacer()
                    Button("Leave") {
                        Task {
                            if await app.leaveSquad(s.id) {
                                AnalyticsService.track(.squadLeft)
                                Toast.success("Left the squad.")
                            } else { Toast.error("Couldn't leave. Try again.") }
                        }
                    }
                    .font(.sora(.medium, 13)).foregroundStyle(Tok.fg3)
                }
            }
        }
    }

    // 6-week challenge countdown + progress toward the goal window.
    private func challengeProgress(end: Double, goalDays: Int) -> some View {
        let now = Date().timeIntervalSince1970 * 1000
        let totalMs = Double(goalDays) * 86_400_000
        let start = end - totalMs
        let elapsed = min(1, max(0, (now - start) / totalMs))
        let daysLeft = max(0, Int((end - now) / 86_400_000))
        return VStack(alignment: .leading, spacing: 6) {
            Track(progress: elapsed, tone: .accent)
            Txt.Muted(now >= end ? "Challenge complete" : "\(daysLeft) day\(daysLeft == 1 ? "" : "s") left in the challenge")
        }
    }
}
