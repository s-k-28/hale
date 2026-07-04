import SwiftUI

// "Treat yourself" savings goals — live myGoals, create, progress, delete.
struct GoalsView: View {
    @Environment(AppState.self) private var app
    @State private var goals = LiveQuery<[Goal]>(Fn.myGoals)
    @State private var label = ""
    @State private var target = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tok.section) {
                Txt.Eyebrow("Your savings", color: Tok.accent)
                Txt.H1("Treat yourself")
                Txt.Body("Every clean day buys back real money — put it toward something you'll actually enjoy.")

                // Content first: your goals lead; the form to add one is demoted below.
                if !goals.loaded {
                    SkeletonList(rows: 2)
                } else if (goals.value ?? []).isEmpty {
                    BrandEmptyState(
                        glyph: .goals,
                        title: "Name what you're\nsaving for",
                        message: "Set your first savings goal below — a trip, a gift, breathing room — and watch clean days pay it off.")
                        .padding(.top, 12)
                } else {
                    ForEach(goals.value ?? []) { g in
                        Card(pad: true) {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Txt.H3(g.label)
                                    Spacer()
                                    if g.reached { Badge(label: "Reached", tone: .solid) }
                                    Button { Task { if await app.deleteGoal(g.id) { AnalyticsService.track(.goalDeleted) } } } label: {
                                        Icon(.trash, size: 16, color: Tok.fg3)
                                    }
                                    .accessibilityLabel("Delete goal \(g.label)")
                                }
                                Track(progress: g.ratio, tone: .accent)
                                Txt.Muted(g.reached
                                          ? String(format: "$%.2f saved — treat unlocked", g.saved)
                                          : String(format: "$%.2f of $%.2f · $%.2f to go", g.saved, g.targetAmount, max(0, g.remaining)))
                            }
                        }
                    }
                }

                Card(pad: true) {
                    VStack(alignment: .leading, spacing: 12) {
                        Txt.Eyebrow((goals.value ?? []).isEmpty ? "What are you saving for?" : "Save for something else")
                        Input(text: $label, placeholder: "A weekend away, new headphones…")
                        Txt.Eyebrow("Dollar target")
                        Input(text: $target, placeholder: "$250")
                        HStack(spacing: 8) {
                            ForEach([50, 100, 250, 500], id: \.self) { amt in
                                Chip(label: "$\(amt)", on: target == "\(amt)") { target = "\(amt)"; Haptics.select() }
                            }
                        }
                        HButton(label: "Set this goal", variant: .primary, sm: true,
                                disabled: label.isEmpty || Double(target) == nil) {
                            Task {
                                let amt = Double(target) ?? 0
                                if await app.setGoal(label: label, target: amt) {
                                    AnalyticsService.track(.savingsGoalSet, ["target_amount": amt])
                                    label = ""; target = ""; Haptics.success(); Toast.success("Goal set.")
                                } else {
                                    Toast.error("Couldn't save that goal. Try again.")
                                }
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: Tok.maxContent).frame(maxWidth: .infinity)
            .padding(.horizontal, Tok.gutter).padding(.top, Tok.screenTop).padding(.bottom, 40)
        }
        .background(HaleBackdrop())
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
    }
}
