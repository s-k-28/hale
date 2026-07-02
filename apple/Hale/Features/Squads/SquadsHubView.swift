import SwiftUI

// Squads hub — your squads + join-by-code. (Create/public-discovery are flag-gated;
// public discovery off in v1.)
struct SquadsHubView: View {
    @Environment(AppState.self) private var app
    @State private var squads = LiveQuery<[Squad]>(Fn.mySquads)
    @State private var joinCode = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Txt.Eyebrow("Squads & challenges", color: Tok.accent)
                Txt.H1("Squads")

                Card(pad: true) {
                    VStack(alignment: .leading, spacing: 10) {
                        Txt.H3("Join a squad")
                        Input(text: $joinCode, placeholder: "Invite code")
                        HButton(label: "Join", variant: .primary, sm: true, disabled: joinCode.isEmpty) {
                            Task { await app.joinSquad(code: joinCode); joinCode = ""; Haptics.success() }
                        }
                    }
                }

                ForEach(squads.value ?? []) { s in
                    Card(pad: true) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack { Txt.H3(s.name); Spacer(); if s.role == "owner" { Badge(label: "Owner", tone: .soft) } }
                            Txt.Body("\(s.memberCount) member\(s.memberCount == 1 ? "" : "s") · code \(s.inviteCode)")
                        }
                    }
                }
                if (squads.value ?? []).isEmpty && squads.loaded {
                    Txt.Muted("You're not in a squad yet. Join with a code above.")
                }
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(Tok.bg.ignoresSafeArea())
        .navigationTitle("Squads").navigationBarTitleDisplayMode(.inline)
    }
}
