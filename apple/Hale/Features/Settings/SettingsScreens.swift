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
                Txt.H1("Delete account")
                Txt.Body("This permanently erases your account, streak, and all data. It can't be undone.")
                Spacer(minLength: 40)
                if !armed {
                    HButton(label: "Delete my account", variant: .coral) { Haptics.warn(); armed = true }
                } else {
                    Txt.Body("Are you sure? Everything will be gone.", color: Tok.coral)
                    HButton(label: "Yes, delete everything", variant: .coral, loading: busy) {
                        busy = true; Task { await app.deleteAccount() }
                    }
                    HButton(label: "Keep my account", variant: .secondary) { armed = false }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(Tok.bg.ignoresSafeArea())
        .navigationTitle("Delete account").navigationBarTitleDisplayMode(.inline)
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
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
        }
        .background(Tok.bg.ignoresSafeArea())
        .navigationTitle("Sources").navigationBarTitleDisplayMode(.inline)
    }
}
