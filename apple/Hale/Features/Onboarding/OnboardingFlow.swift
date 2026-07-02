import SwiftUI

// Pre-quiz gate chain (age 21+ → medical disclaimer → welcome → quiz), enforced by
// UserDefaults flags, mirroring (onboarding)/welcome|age|notice.tsx.
struct OnboardingFlow: View {
    @State private var gateTick = 0   // bump to re-read Prefs after a gate passes

    var body: some View {
        Group {
            if Self.startAtQuiz {
                NavigationStack { QuizView() }
            } else if !Prefs.ageConfirmed21 {
                AgeGate { gateTick += 1 }
            } else if !Prefs.disclaimerAck {
                NoticeGate { gateTick += 1 }
            } else {
                NavigationStack { WelcomeView() }
            }
        }
        .id(gateTick)
    }

    // Debug: SIMCTL_CHILD_HALE_START=quiz jumps straight to the quiz for screenshots.
    static var startAtQuiz: Bool { ProcessInfo.processInfo.environment["HALE_START"] == "quiz" }
}

struct AgeGate: View {
    var onConfirm: () -> Void
    @State private var blocked = false

    var body: some View {
        Screen {
            VStack(alignment: .leading, spacing: 16) {
                Spacer()
                if blocked {
                    Txt.H1("HALE is for\nadults 21 and older")
                    Txt.Lead("Nicotine cessation support in HALE is restricted to adults aged 21 or older. We're sorry we can't help here, and we hope you stay nicotine-free.")
                    Txt.Lead("If you're under 21 and using nicotine, free confidential help is available from your doctor, school counselor, or local quitline.")
                    Spacer()
                    HButton(label: "I selected this by mistake", variant: .ghost) { blocked = false }
                } else {
                    Txt.H1("Are you 21\nor older?")
                    Txt.Lead("HALE supports adults quitting nicotine.")
                    Spacer()
                    HButton(label: "I am 21 or older", variant: .primary) {
                        Prefs.ageConfirmed21 = true; onConfirm()
                    }
                    HButton(label: "I am under 21", variant: .ghost) { Haptics.warn(); blocked = true }
                    Txt.Muted("Asked once. Your answer stays on this device.")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tok.gutter)
            .padding(.bottom, 30)
        }
    }
}

struct NoticeGate: View {
    var onAck: () -> Void
    var body: some View {
        Screen {
            VStack(alignment: .leading, spacing: 16) {
                Spacer()
                Txt.H1("A quick note\nbefore we start")
                Txt.Lead("HALE is a support tool, not a medical device, and it does not provide medical advice, diagnosis, or treatment.")
                Txt.Lead("Recovery timelines in the app reflect commonly reported milestones from public health sources. Everyone's body is different.")
                Txt.Muted("Sources for every health claim are listed under You ▸ Disclaimers & sources.")
                Spacer()
                HButton(label: "I understand", variant: .primary) { Prefs.disclaimerAck = true; onAck() }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tok.gutter)
            .padding(.bottom, 30)
        }
    }
}

struct WelcomeView: View {
    var body: some View {
        Screen {
            VStack(alignment: .leading, spacing: 0) {
                Spacer()
                logo
                Txt.Hero("Quit\nnicotine.")
                    .padding(.top, 8)
                Text("Together.")
                    .font(.sora(.bold, 44)).foregroundStyle(Tok.accent)
                Txt.Lead("Build a quit plan that holds. Crush the cravings with people who get it.")
                    .padding(.top, 16)
                Spacer()
                NavigationLink { QuizView() } label: {
                    HButtonLabel(label: "Build my quit plan")
                }
                Txt.Muted("Free to start · 60-second setup")
                    .padding(.top, 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tok.gutter)
            .padding(.bottom, 30)
        }
        .navigationBarBackButtonHidden(true)
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

// A button-styled label for use inside NavigationLink (visual parity with HButton primary).
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
