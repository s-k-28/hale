import SwiftUI

// Weekly consistency league — opt-in vs ranked leaderboard by quit-stage.
struct LeaguesView: View {
    @Environment(AppState.self) private var app
    @State private var league = LiveQuery<MyLeague>(Fn.myLeague)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Txt.Eyebrow("Weekly league", color: Tok.accent)
                Txt.H1("League")
                if let l = league.value {
                    if l.optedIn {
                        if let rank = l.rank { Txt.Body("You're #\(rank) this week.") }
                        ForEach(Array(l.entries.enumerated()), id: \.offset) { i, e in
                            Card2(pad: true) {
                                HStack {
                                    Text("\(i + 1)").font(.sora(.bold, 15)).foregroundStyle(Tok.fg3).frame(width: 28)
                                    Text(e.name).font(.sora(.semibold, 15)).foregroundStyle(e.isMe ? Tok.accent : Tok.fg)
                                    Spacer()
                                    Text("\(e.score)").font(.sora(.bold, 15)).foregroundStyle(Tok.fg)
                                }
                            }
                        }
                        HButton(label: "Leave league", variant: .secondary, sm: true) { Task { await app.leaveLeague() } }
                    } else {
                        Card(pad: true) {
                            VStack(alignment: .leading, spacing: 10) {
                                Txt.H3("Join this week's league")
                                Txt.Body("Compete on check-in consistency with others at your stage. Friendly, private, resets weekly.")
                                HButton(label: "Opt in", variant: .primary) { Task { await app.leagueOptIn(); Haptics.success() } }
                            }
                        }
                    }
                } else {
                    ProgressView().tint(Tok.accent)
                }
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(Tok.bg.ignoresSafeArea())
        .navigationTitle("League").navigationBarTitleDisplayMode(.inline)
    }
}
