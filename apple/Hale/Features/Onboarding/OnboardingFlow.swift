import SwiftUI

// Pre-quiz gate chain (age 21+ → medical disclaimer → welcome → quiz), enforced
// by UserDefaults flags, mirroring (onboarding)/welcome|age|notice.tsx.
//
// Cinematic layer: the whole onboarding is one continuous story on a single
// shared AtmosphereView — cold haze at the gates, slowly clearing to emerald
// as the quiz progresses (QuizView drives it through the bindings). Chapters
// switch with film-exposure beats instead of navigation pushes.
struct OnboardingFlow: View {
    private enum Chapter { case age, notice, welcome, quiz }

    @State private var chapter: Chapter
    @State private var quizAtmosphere: Atmosphere = .journey(0)
    @State private var parallax: CGFloat = 0

    init() {
        switch Self.startChapter {
        case "quiz":    _chapter = State(initialValue: .quiz)
        case "welcome": _chapter = State(initialValue: .welcome)
        case "notice":  _chapter = State(initialValue: .notice)
        case "age":     _chapter = State(initialValue: .age)
        default:
            if !Prefs.ageConfirmed21 { _chapter = State(initialValue: .age) }
            else if !Prefs.disclaimerAck { _chapter = State(initialValue: .notice) }
            else { _chapter = State(initialValue: .welcome) }
        }
    }

    private var atmosphere: Atmosphere {
        switch chapter {
        case .age, .notice: return .haze
        case .welcome:      return Atmosphere(clarity: 0.12, energy: 0.6, warmth: 0, glow: 0.45, glowY: 1.05)
        case .quiz:         return quizAtmosphere
        }
    }

    var body: some View {
        ZStack {
            HaleBackdrop()
            AtmosphereView(target: atmosphere, parallax: parallax)
            Group {
                switch chapter {
                case .age:
                    AgeGate { move(to: .notice) }.transition(.storyBeat)
                case .notice:
                    NoticeGate { move(to: .welcome) }.transition(.storyBeat)
                case .welcome:
                    WelcomeScene { move(to: .quiz) }.transition(.storyBeat)
                case .quiz:
                    QuizView(atmosphere: $quizAtmosphere, parallax: $parallax,
                             onExit: { move(to: .welcome) })
                        .transition(.storyBeat)
                }
            }
        }
    }

    private func move(to next: Chapter) {
        Haptics.breath(.inhale)
        withAnimation(.easeInOut(duration: 0.55)) { chapter = next }
    }

    // Debug: SIMCTL_CHILD_HALE_START=age|notice|welcome|quiz jumps straight to a
    // chapter for screenshots (bypasses the UserDefaults gate flags).
    static var startChapter: String { ProcessInfo.processInfo.environment["HALE_START"] ?? "" }
}

struct AgeGate: View {
    var onConfirm: () -> Void
    @State private var blocked = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            if blocked {
                Txt.H1("HALE is for\nadults 21 and older").riseIn(0)
                Txt.Lead("Nicotine cessation support in HALE is restricted to adults aged 21 or older. We're sorry we can't help here, and we hope you stay nicotine-free.").riseIn(1)
                Txt.Lead("If you're under 21 and using nicotine, free confidential help is available from your doctor, school counselor, or local quitline.").riseIn(2)
                Spacer()
                HButton(label: "I selected this by mistake", variant: .ghost) { blocked = false }
            } else {
                Txt.H1("Are you 21\nor older?").riseIn(0)
                Txt.Lead("HALE supports adults quitting nicotine. You must be 21 or older to use this app.").riseIn(1)
                Spacer()
                HButton(label: "I am 21 or older", variant: .primary) {
                    Prefs.ageConfirmed21 = true; onConfirm()
                }
                HButton(label: "I am under 21", variant: .ghost) { Haptics.warn(); blocked = true }
                Txt.Muted("Asked once. Your answer stays on this device.").riseIn(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter)
        .padding(.bottom, 30)
    }
}

struct NoticeGate: View {
    var onAck: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Txt.H1("A quick note\nbefore we start").riseIn(0)
            Txt.Lead("HALE is a support tool, not a medical device, and it does not provide medical advice, diagnosis, or treatment.").riseIn(1)
            Txt.Lead("Recovery timelines in the app reflect commonly reported milestones from public health sources. Everyone's body is different. For medical questions about quitting nicotine, talk to a doctor, pharmacist, or quitline.").riseIn(2)
            Txt.Muted("Sources for every health claim are listed under You ▸ Disclaimers & sources.").riseIn(3)
            Spacer()
            HButton(label: "I understand", variant: .primary) { Prefs.disclaimerAck = true; onAck() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter)
        .padding(.bottom, 30)
    }
}

// The story's opening scene: the title card, and Sage introduces itself.
struct WelcomeScene: View {
    var onBegin: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            logo.riseIn(0)
            Txt.Hero("Quit\nnicotine.")
                // 88pt Hero: "nicotine." is wider than any phone — shrink to fit
                // rather than truncate to "Quit nicoti…" on SE / 15 / 17 Pro.
                .lineLimit(2)
                .minimumScaleFactor(0.5)
                .padding(.top, 8)
                .riseIn(1, delay: 0.1, distance: 18)
            Text("Together.")
                .font(.sora(.bold, 44)).foregroundStyle(Tok.accent)
                .lineLimit(1).minimumScaleFactor(0.6)
                .riseIn(2, delay: 0.25, distance: 18)
            NarratorText(line: "I'm Sage. Give me sixty seconds and I'll build a quit plan that's actually yours.", delay: 0.7)
                .padding(.top, 16)
            Spacer()
            InviteCodeEntry().riseIn(3, delay: 0.4)
            StoryDock {
                HButton(label: "Build my quit plan", variant: .primary) {
                    Haptics.press(); onBegin()
                }
                Txt.Muted("Free to start · 60-second setup")
                legalNote
            }
            .padding(.horizontal, -Tok.gutter)   // dock manages its own gutter
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter)
        .padding(.bottom, 16)
    }

    private var legalNote: some View {
        VStack(spacing: 4) {
            Text("By continuing you agree to our Terms and Privacy Policy. We use privacy-safe analytics to improve HALE — turn it off anytime in You ▸ Settings.")
                .font(.sora(.regular, 11)).foregroundStyle(Tok.fg3)
                .multilineTextAlignment(.center)
            HStack(spacing: 14) {
                Link("Terms", destination: Links.terms)
                Link("Privacy", destination: Links.privacy)
            }
            .font(.sora(.semibold, 11)).foregroundStyle(Tok.fg2)
        }
        .padding(.top, 4)
    }

    private var logo: some View {
        HStack(spacing: 10) {
            Text("H")
                .font(.sora(.extrabold, 22)).foregroundStyle(Tok.accentInk)
                .frame(width: 40, height: 40)
                .background(Tok.accent)
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            Text("HALE").font(.sora(.bold, 20)).tracking(2).foregroundStyle(Tok.fg)
        }
    }
}

// Welcome-screen invite-code entry (v1 code-first attribution; mirrors
// InviteCodeEntry.tsx). Resolving a code stashes the inviter as pendingBuddyId,
// which the quiz commit then redeems (attributeInstall + pairWith). idle →
// checking → applied | notFound | error.
struct InviteCodeEntry: View {
    @Environment(AppState.self) private var app
    @State private var code = ""
    @State private var state: EntryState = .idle
    private enum EntryState: Equatable { case idle, checking, applied, notFound, error }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Input(text: $code, placeholder: "Invite code (optional)")
                    .textInputAutocapitalization(.characters)
                    .disabled(state == .checking || state == .applied)
                HButton(label: state == .applied ? "Applied" : "Apply", variant: .secondary, sm: true,
                        loading: state == .checking,
                        disabled: code.trimmingCharacters(in: .whitespaces).isEmpty || state == .applied) {
                    Task { await apply() }
                }
                .fixedSize()
            }
            switch state {
            case .applied:  note("Invite applied. We'll credit your friend when you pair up.", Tok.accent)
            case .notFound: note("That code didn't match. Double-check it and try again.", Tok.coral)
            case .error:    note("Couldn't check the code. Try again.", Tok.coral)
            case .idle, .checking: EmptyView()
            }
        }
    }

    private func note(_ s: String, _ c: Color) -> some View {
        Text(s).font(.sora(.medium, 12)).foregroundStyle(c)
    }

    private func apply() async {
        let c = code.trimmingCharacters(in: .whitespaces).uppercased()
        guard !c.isEmpty else { return }
        state = .checking
        if let inviter = await app.resolveInviteCode(c) {
            Prefs.pendingBuddyId = inviter
            state = .applied
            Haptics.success()
            AnalyticsService.track(.referralCodeEntered, ["found": true])
        } else {
            state = .notFound
            Haptics.warn()
            AnalyticsService.track(.referralCodeEntered, ["found": false])
        }
    }
}

// A button-styled label for use inside NavigationLink/ShareLink (visual parity
// with HButton primary). Used by Referral + Squad shares.
struct HButtonLabel: View {
    let label: String
    var body: some View {
        Text(label)
            .font(.sora(.bold, 16)).tracking(-0.16)
            .foregroundStyle(Tok.accentInk)
            .frame(maxWidth: .infinity).frame(height: 56)
            .background(Tok.accent)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
            .shadow(color: Tok.accent.opacity(0.35), radius: 15, x: 0, y: 8)
    }
}
