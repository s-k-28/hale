import SwiftUI
import Pow

// Sage AI coach — a clean, spacious chat. A quiet header, comfortable bubble
// spacing, and one input; nothing competes with the conversation. Live
// sage.messages transcript, consent gate, send, typing, free-tier cap upsell.
struct CoachView: View {
    @Environment(AppState.self) private var app
    @State private var messages = LiveQuery<[SageMessage]>(Fn.sageMessages)
    @State private var consent = LiveQuery<AiConsent>(Fn.aiConsentStatus)
    @State private var draft = ""
    @State private var sending = false
    @State private var capHit = false
    @State private var showPaywall = false
    @State private var sends = 0      // send-button pop trigger
    @State private var shakes = 0     // composer shake on rejection

    private var consented: Bool { consent.value?.consented == true }
    private var msgs: [SageMessage] { messages.value ?? [] }
    private var awaitingReply: Bool { sending || (msgs.last?.role == "user") }
    private var canSend: Bool { !draft.trimmingCharacters(in: .whitespaces).isEmpty && !sending && consented }

    // Send → analytics funnel + cap upsell. Distinguishes network error (res==nil,
    // restore draft, no cap) from a server-side cap (accepted==false). coach.tsx:113-153.
    private func send(_ content: String) async {
        let res = await app.sendSage(content)
        sending = false
        guard let res else {
            draft = content; shakes += 1; Haptics.warn()
            Toast.error("Couldn't reach Sage. Check your connection and try again.")
            return
        }
        AnalyticsService.track(.coachMessageSent,
                               ["tier": res.tier, "messages_today_count": res.dailyCount, "cap_state": res.capType ?? "none"])
        if res.accepted {
            capHit = false; Haptics.soft()
            if !Prefs.firstSage { Prefs.firstSage = true; AnalyticsService.track(.firstSageMessage) }
        } else {
            draft = content; shakes += 1; Haptics.warn()
            AnalyticsService.track(.sageCapHit,
                                   ["tier": res.tier, "cap_type": res.capType ?? "", "daily_count": res.dailyCount])
            if res.tier == "free" { capHit = true }
            Toast.info(res.tier == "free"
                       ? "Daily Sage limit reached. Unlock unlimited with HALE+."
                       : "You've reached today's Sage limit.")
        }
    }

    var body: some View {
        ZStack {
            HaleBackdrop()
            VStack(spacing: 0) {
                header
                Group {
                    if !messages.loaded || !consent.loaded {
                        VStack { Spacer(); ProgressView().tint(Tok.accent); Spacer() }
                    } else if msgs.isEmpty {
                        emptyState
                    } else {
                        transcript
                    }
                }
                .frame(maxHeight: .infinity)
                if consent.loaded && !consented { consentCard }
                else if capHit { capUpsell }
                composer
            }
        }
        .fullScreenCover(isPresented: $showPaywall) { PaywallView(from: "unlimited_sage") }
        .onAppear { AnalyticsService.track(.coachSession) }
    }

    // Quiet header: a small name + a live "here" status, and one demoted line of
    // required safety copy. Deliberately understated so the chat leads.
    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Txt.H2("Sage")
                Circle().fill(Tok.accent).frame(width: 7, height: 7)
                    .breathing(period: 2.8, scale: 0.85...1.15, opacity: 0.5...1.0)
                Text("here for you").font(.sora(.medium, 13)).foregroundStyle(Tok.fg3)
                Spacer()
            }
            Txt.Muted("AI coach, not a medical professional — talk to a doctor before medical decisions, including NRT or medication.")
                .font(.sora(.regular, 12))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter).padding(.top, 8).padding(.bottom, 14)
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    ForEach(Array(msgs.enumerated()), id: \.element.id) { i, m in
                        bubble(m)
                            .id(m.id)
                            .transition(.scale(scale: 0.9, anchor: m.role == "user" ? .bottomTrailing : .bottomLeading)
                                .combined(with: .opacity))
                            .riseIn(min(i, 6))
                    }
                    if awaitingReply {
                        TypingIndicator()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .transition(.scale(scale: 0.8, anchor: .bottomLeading).combined(with: .opacity))
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .animation(Springs.rise, value: msgs.count)
                .animation(Springs.rise, value: awaitingReply)
                .padding(.horizontal, Tok.gutter).padding(.top, 8).padding(.bottom, 12)
            }
            .scrollIndicators(.hidden)
            .onChange(of: msgs.count) { _, _ in withAnimation { proxy.scrollTo("bottom") } }
        }
    }

    // Comfortable bubbles: generous padding, calm line spacing, and a soft
    // shoulder of empty space so a turn never spans the full width.
    private func bubble(_ m: SageMessage) -> some View {
        HStack {
            if m.role == "user" { Spacer(minLength: 52) }
            Text(m.content)
                .font(.sora(.regular, 15)).lineSpacing(5)
                .foregroundStyle(m.role == "user" ? Tok.accentInk : Tok.fg)
                .padding(.vertical, 12).padding(.horizontal, 16)
                .background(m.role == "user" ? Tok.accent : Tok.surface)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(m.role == "user" ? .clear : Tok.stroke, lineWidth: 1)
                )
            if m.role != "user" { Spacer(minLength: 52) }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 18) {
            Spacer()
            // Calm Sage presence — a subtly breathing orb (Lottie, procedural fallback).
            LoopingLottie(name: "sage-presence") { SageOrb(diameter: 128) }
                .frame(width: 200, height: 200)
                .riseIn(0, distance: 16)
            VStack(spacing: 12) {
                Txt.Display("Hey,\nI'm Sage", size: 40).multilineTextAlignment(.center).riseIn(1)
                Txt.Body("I'm here the second a craving hits. Tell me what's going on — no judgment, just backup while you ride it out. It peaks, then it passes.")
                    .multilineTextAlignment(.center).frame(maxWidth: 320).riseIn(2)
                Txt.Eyebrow("Cravings pass · you don't quit on yourself", color: Tok.accent).riseIn(3)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity).padding(.horizontal, Tok.gutter)
    }

    private var consentCard: some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 10) {
                Txt.H3("Before you chat with Sage")
                Txt.Body("Sage shares your messages and quit stats with our AI providers — Groq (chat) and Google (memory) — so it can work. Never for ads. You can turn this off anytime in You ▸ Settings.")
                Link(destination: Links.privacy) {
                    Text("Read the privacy policy").font(.sora(.semibold, 14)).foregroundStyle(Tok.accent)
                }
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
                Icon(.premium, size: 18, color: Tok.accent)
            }
            .padding(16).frame(maxWidth: .infinity)
            .background(Tok.accentSoft)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
        .padding(.horizontal, Tok.gutter).padding(.bottom, 8)
    }

    // One clean input, floating on glass, separated from the transcript by a
    // barely-there hairline so the conversation stays the focus.
    private var composer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Tok.hairline).frame(height: 1)
            HStack(spacing: 10) {
                TextField(consented ? "Talk to Sage…" : "Agree above to start chatting", text: $draft, axis: .vertical)
                    .font(.sora(.regular, 15)).foregroundStyle(Tok.fg).tint(Tok.accent)
                    .disabled(!consented)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(Tok.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                Button {
                    let content = draft.trimmingCharacters(in: .whitespaces)
                    draft = ""; sending = true; sends += 1
                    Task { await send(content) }
                } label: {
                    Image(systemName: "arrow.up").font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Tok.accentInk).frame(width: 44, height: 44)
                        .background(canSend ? Tok.accent : Tok.surface3).clipShape(Circle())
                        .animation(Springs.button, value: canSend)
                }
                .buttonStyle(SpringPress())
                .changeEffect(.jump(height: 8), value: sends)
                .disabled(!canSend)
                .accessibilityLabel("Send message")
            }
            .changeEffect(.shake(rate: .fast), value: shakes)
            .padding(.horizontal, Tok.gutter).padding(.top, 12).padding(.bottom, 10)
        }
    }
}

struct TypingIndicator: View {
    @State private var phase = 0.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle().fill(Tok.fg3).frame(width: 6, height: 6)
                    .offset(y: reduceMotion ? 0 : sin(phase + Double(i) * 0.6) * 3)
            }
        }
        .padding(.vertical, 13).padding(.horizontal, 18)
        .background(Tok.surface).clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Tok.stroke, lineWidth: 1))
        // Reduce Motion: no bouncing dots (static), still announced to VoiceOver.
        .onAppear { if !reduceMotion { withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { phase = .pi * 2 } } }
        .accessibilityLabel("Sage is typing")
    }
}
