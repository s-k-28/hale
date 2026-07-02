import SwiftUI

// "Treat yourself" savings goals — live myGoals, create, progress, delete.
struct GoalsView: View {
    @Environment(AppState.self) private var app
    @State private var goals = LiveQuery<[Goal]>(Fn.myGoals)
    @State private var label = ""
    @State private var target = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Txt.Eyebrow("Treat yourself", color: Tok.accent)
                Txt.H1("Savings goals")
                Txt.Body("Turn money not spent into something you'll enjoy.")

                Card(pad: true) {
                    VStack(alignment: .leading, spacing: 12) {
                        Input(text: $label, placeholder: "e.g. New headphones")
                        Input(text: $target, placeholder: "Target $")
                        HButton(label: "Add goal", variant: .primary, sm: true,
                                disabled: label.isEmpty || Double(target) == nil) {
                            Task {
                                await app.setGoal(label: label, target: Double(target) ?? 0)
                                label = ""; target = ""; Haptics.success()
                            }
                        }
                    }
                }

                ForEach(goals.value ?? []) { g in
                    Card(pad: true) {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Txt.H3(g.label)
                                Spacer()
                                if g.reached { Badge(label: "Reached", tone: .solid) }
                                Button { Task { await app.deleteGoal(g.id) } } label: {
                                    Image(systemName: "trash").foregroundStyle(Tok.fg3)
                                }
                            }
                            Track(progress: g.ratio, tone: .accent)
                            Txt.Muted("$\(Int(g.saved)) of $\(Int(g.targetAmount))")
                        }
                    }
                }
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(Tok.bg.ignoresSafeArea())
        .navigationTitle("Goals").navigationBarTitleDisplayMode(.inline)
    }
}
