import SwiftUI

// Account deletion (Guideline 5.1.1(v)) — two-step arm → confirm.
struct DeleteAccountView: View {
    @Environment(AppState.self) private var app
    @State private var armed = false
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Txt.Eyebrow("Account", color: Tok.coral)
                Txt.H1("Delete your\naccount")
                Txt.Body("This permanently erases your quit history, check-ins, cravings, Sage conversations, goals, squads you own, and your buddy pairing. It cannot be undone.")
                Txt.Muted("Deleting your account does not cancel an App Store subscription. Manage that in Settings, then Apple ID, then Subscriptions.")
                Spacer(minLength: 40)
                if !armed {
                    HButton(label: "Delete my account", variant: .coral) { Haptics.warn(); armed = true }
                } else {
                    Txt.Body("Last check: this is permanent and immediate. There's no way to recover your account after this.", color: Tok.coral)
                    HButton(label: "Yes, permanently delete everything", variant: .coral, loading: busy) {
                        guard !busy else { return }
                        busy = true
                        AnalyticsService.track(.accountDeleted)
                        Task { await app.deleteAccount() }
                    }
                    HButton(label: "Keep my account", variant: .secondary, disabled: busy) { armed = false }
                }
            }
            .frame(maxWidth: Tok.maxContent, alignment: .leading)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(HaleBackdrop())
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
    }
}

// Disclaimers & sources (Guideline 1.4.1) — static.
struct DisclaimersView: View {
    private let sources = [
        ("Recovery timeline", "CDC, WHO, and US Surgeon General benefits-of-quitting timelines."),
        ("Heart rate & blood oxygen", "Commonly reported to normalize within hours to a day of quitting."),
        ("Carbon monoxide", "Typically clears from the blood within ~24 hours."),
        ("Lung function", "Reported to improve noticeably over weeks to months."),
        ("Heart-disease risk", "Excess risk typically about halved after a year quit."),
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Txt.Eyebrow("Disclaimers & sources", color: Tok.accent)
                Txt.H1("Sources")
                Txt.Body("HALE is a support tool, not medical advice. Recovery timelines reflect commonly reported public-health milestones; everyone's body is different.")
                ForEach(Array(sources.enumerated()), id: \.offset) { _, s in
                    Card2(pad: true) {
                        VStack(alignment: .leading, spacing: 4) {
                            Txt.H3(s.0)
                            Txt.Body(s.1)
                        }
                    }
                }
                Card(pad: true) {
                    VStack(alignment: .leading, spacing: 8) {
                        Txt.H3("Not medical advice")
                        Txt.Body("HALE supports your quit; it does not diagnose or treat. For medical questions about quitting nicotine — including NRT or medication — talk to a doctor, pharmacist, or a free quitline at 1-800-QUIT-NOW.")
                        Button("Call 1-800-QUIT-NOW") { open("tel:18007848669") }
                            .font(.sora(.semibold, 14)).foregroundStyle(Tok.accent)
                    }
                }
                Txt.Muted("If you're in crisis or thinking about self-harm, call or text 988 (Suicide & Crisis Lifeline, US).")
                Button("Call or text 988") { open("tel:988") }
                    .font(.sora(.semibold, 14)).foregroundStyle(Tok.coral)
            }
            .frame(maxWidth: Tok.maxContent, alignment: .leading)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(HaleBackdrop())
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
    }
    private func open(_ s: String) { if let u = URL(string: s) { UIApplication.shared.open(u) } }
}
