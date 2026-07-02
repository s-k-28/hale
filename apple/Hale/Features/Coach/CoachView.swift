import SwiftUI

// Sage AI coach — live sage.messages transcript, consent gate, send, typing
// indicator, free-tier daily-cap upsell. Reply arrives as a new row on the live sub.
struct CoachView: View {
    @Environment(AppState.self) private var app
    @State private var messages = LiveQuery<[SageMessage]>(Fn.sageMessages)
    @State private var consent = LiveQuery<AiConsent>(Fn.aiConsentStatus)
    @State private var draft = ""
    @State private var sending = false
    @State private var capHit = false
    @State private var showPaywall = false

    private var consented: Bool { consent.value?.consented == true }
    private var msgs: [SageMessage] { messages.value ?? [] }
    private var awaitingReply: Bool { sending || (msgs.last?.role == "user") }
    private var canSend: Bool { !draft.trimmingCharacters(in: .whitespaces).isEmpty && !sending && consented }

    var body: some View {
        ZStack {
            Tok.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if msgs.isEmpty && consented {
                    emptyState
                } else {
                    transcript
                }
                if !consented { consentCard }
                else if capHit { capUpsell }
                composer
            }
        }
        .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "unlimited_sage") }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Txt.Display("SAGE", size: 34)
            Txt.Eyebrow("Your quit coach · always on", color: Tok.accent)
            Txt.Muted("AI coach, not a medical professional — check with a doctor before medical decisions.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter).padding(.top, 8).padding(.bottom, 12)
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(msgs) { m in bubble(m).id(m.id) }
                    if awaitingReply { TypingIndicator().frame(maxWidth: .infinity, alignment: .leading) }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, Tok.gutter).padding(.vertical, 8)
            }
            .onChange(of: msgs.count) { _, _ in withAnimation { proxy.scrollTo("bottom") } }
        }
    }

    private func bubble(_ m: SageMessage) -> some View {
        HStack {
            if m.role == "user" { Spacer(minLength: 40) }
            Text(m.content)
                .font(.sora(.regular, 15)).lineSpacing(4)
                .foregroundStyle(m.role == "user" ? Tok.accentInk : Tok.fg)
                .padding(.vertical, 10).padding(.horizontal, 14)
                .background(m.role == "user" ? Tok.accent : Tok.surface)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(alignment: .leading) {
                    if m.role != "user" { Rectangle().fill(Tok.accentDeep).frame(width: 2) }
                }
            if m.role != "user" { Spacer(minLength: 40) }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Spacer()
            Txt.Display("Hey,\nI'm Sage", size: 40)
            Txt.Body("I'm here the second a craving hits. Tell me what's going on — no judgment, just backup while you ride it out.")
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity).padding(.horizontal, Tok.gutter)
    }

    private var consentCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 10) {
                Txt.H3("Before you chat with Sage")
                Txt.Body("Sage shares your messages and quit stats with our AI providers to work. You can turn this off anytime in You ▸ Settings.")
                HButton(label: "I agree — start chatting", variant: .primary) {
                    Task { await app.setAiConsent() }
                }
            }
        }.padding(.horizontal, Tok.gutter).padding(.bottom, 8)
    }

    private var capUpsell: some View {
        Button { AnalyticsService.track(.paywallFeatureTapped, ["feature": "unlimited_sage"]); showPaywall = true } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Unlock unlimited coaching").font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                    Text("You've hit today's free limit. HALE+ removes the cap.").font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                }
                Spacer()
                Image(systemName: "lock.fill").foregroundStyle(Tok.accent)
            }
            .padding(16).frame(maxWidth: .infinity)
            .background(Tok.accentSoft)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
        .padding(.horizontal, Tok.gutter).padding(.bottom, 8)
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField(consented ? "Talk to Sage…" : "Agree above to start chatting", text: $draft, axis: .vertical)
                .font(.sora(.regular, 15)).foregroundStyle(Tok.fg).tint(Tok.accent)
                .disabled(!consented)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(Tok.surface2)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            Button {
                let content = draft.trimmingCharacters(in: .whitespaces)
                draft = ""; sending = true
                Task {
                    let res = await app.sendSage(content)
                    sending = false
                    if res?.accepted == false {
                        draft = content
                        if res?.tier == "free" { capHit = true; Haptics.warn() }
                    } else { capHit = false; Haptics.soft() }
                }
            } label: {
                Image(systemName: "arrow.up").font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Tok.accentInk).frame(width: 44, height: 44)
                    .background(canSend ? Tok.accent : Tok.surface3).clipShape(Circle())
            }
            .disabled(!canSend)
        }
        .padding(.horizontal, Tok.gutter).padding(.top, 6).padding(.bottom, 10)
        .background(Tok.bg)
    }
}

struct TypingIndicator: View {
    @State private var phase = 0.0
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle().fill(Tok.fg3).frame(width: 6, height: 6)
                    .offset(y: sin(phase + Double(i) * 0.6) * 3)
            }
        }
        .padding(.vertical, 12).padding(.horizontal, 16)
        .background(Tok.surface).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onAppear { withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { phase = .pi * 2 } }
    }
}
