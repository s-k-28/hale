import SwiftUI

// Craving SOS — crisis state machine: home → ride | breathe | log | slipChoose → recover.
// Anti-shame throughout (never warn/error haptics on slips). 988 crisis link.
struct SOSView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app

    private enum Step: Equatable { case home, ride, breathe, log, slipChoose, recover }
    @State private var step: Step = .home
    @State private var resolvedBy = "timer"
    @State private var recovered: RelapseResult?
    @State private var slipBusy = false

    var body: some View {
        ZStack {
            HaleBackdrop()
            switch step {
            case .home:       home
            case .ride:       RideItOut { resolvedBy = "timer"; step = .log } onSlip: { step = .slipChoose }
            case .breathe:    BoxBreathing { resolvedBy = "breathing"; step = .log } onSlip: { step = .slipChoose }
            case .log:        CravingLog(resolvedBy: resolvedBy, onDone: close)
            case .slipChoose: slipChoose
            case .recover:    RecoverKindly(result: recovered, onDone: close, onSage: sageAndClose)
            }
        }
        .onAppear {
            Haptics.heavy()
            AnalyticsService.track(.cravingSosOpened)
            if !Prefs.firstSos { Prefs.firstSos = true; AnalyticsService.track(.firstSos) }
        }
    }

    private func close() { dismiss() }
    private func sageAndClose() { dismiss() /* Coach tab focus handled by root in a later pass */ }

    private var home: some View {
        ZStack(alignment: .top) {
            CoralGlow()   // breathing coral field — the room feels alive, not alarming
            homeContent
        }
    }

    private var homeContent: some View {
      // Crisis screen: never clip the options. Fills the height so the Spacers
      // still distribute when it fits, and scrolls on SE / large Dynamic Type /
      // landscape instead of pushing the SOS choices off-screen.
      GeometryReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 14) {
            HStack {
                HStack(spacing: 8) { Circle().fill(Tok.coral).frame(width: 8, height: 8); Txt.Eyebrow("Craving SOS", color: Tok.coral) }
                Spacer()
                IconBtn(systemName: "xmark") { dismiss() }
            }
            Spacer()
            Txt.H1("You're not\nin danger.")
            Txt.Display("This passes.", size: 44, color: Tok.coral)
                .lineLimit(1).minimumScaleFactor(0.5)
            Txt.Body("A craving peaks in a few minutes, then fades — whether or not you act on it. Let's get you to the other side. Pick one:")
            Spacer()
            option("Ride it out", "A 5-minute timer. It peaks, then fades.", "timer", coral: true) { step = .ride }
            option("Breathe", "Box breathing — slow it all down.", "wind") { step = .breathe }
            option("Talk to Sage", "Your coach is here, right now.", "message.fill") { sageAndClose() }
            Button("I slipped — it's okay, let's keep going") { Haptics.tap(); step = .slipChoose }
                .font(.sora(.medium, 14)).foregroundStyle(Tok.fg3).padding(.top, 4)
            Disclaimer()
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, Tok.gutter).padding(.bottom, 24)
          .frame(minHeight: proxy.size.height, alignment: .top)
        }
        .scrollIndicators(.hidden)
      }
    }

    private func option(_ title: String, _ sub: String, _ icon: String, coral: Bool = false, _ tap: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); tap() } label: {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 20)).foregroundStyle(coral ? Tok.coral : Tok.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.sora(.semibold, 16)).foregroundStyle(Tok.fg)
                    Text(sub).font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                }
                Spacer()
            }
            .padding(16).frame(maxWidth: .infinity)
            .background(coral ? Tok.coralSoft : Tok.surface)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous)
                .strokeBorder(coral ? Tok.coralEdge : Tok.stroke, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
    }

    private var slipChoose: some View {
      GeometryReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 14) {
            HStack { Spacer(); IconBtn(systemName: "xmark") { step = .home } }
            Spacer()
            Txt.H1("Slips are part\nof quitting.")
            Txt.Display("Not the end.", size: 40, color: Tok.accent)
                .lineLimit(1).minimumScaleFactor(0.5)
            Txt.Body("Be honest with yourself — it's the only way the data helps you. Which one fits?")
            Spacer()
            slipCard("Just a slip", "One moment, and I'm back on track. Your streak is protected.", badge: "Streak safe", accent: true) {
                commitSlip(kind: "lapse")
            }
            slipCard("I'm back on it for now", "We'll start a fresh run, and keep everything you've already earned.", badge: nil, accent: false) {
                commitSlip(kind: "relapse")
            }
            Button("Actually, I'm okay. Go back") { Haptics.tap(); step = .home }
                .font(.sora(.medium, 14)).foregroundStyle(Tok.fg3)
            Disclaimer()
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, Tok.gutter).padding(.bottom, 24)
          .frame(minHeight: proxy.size.height, alignment: .top)
        }
        .scrollIndicators(.hidden)
      }
    }

    private func slipCard(_ title: String, _ body: String, badge: String?, accent: Bool, _ tap: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); tap() } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(title).font(.sora(.semibold, 16)).foregroundStyle(Tok.fg)
                    if let badge { Badge(label: badge, tone: .soft) }
                }
                Text(body).font(.sora(.regular, 14)).foregroundStyle(Tok.fg2)
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(accent ? Tok.accentSoft : Tok.surface)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous)
                .strokeBorder(accent ? Tok.accentEdge : Tok.stroke, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
    }

    private func commitSlip(kind: String) {
        guard !slipBusy else { return }
        slipBusy = true
        Task {
            let res = await app.logRelapse(kind: kind)
            var p: [String: Any] = ["kind": kind]
            if kind == "relapse" {
                if let s = res?.streakAtRelapse { p["streak_at_relapse"] = s }
                if let l = res?.lapsesBeforeRelapse { p["lapses_before_relapse"] = l }
            }
            AnalyticsService.track(.relapseLogged, p)
            slipBusy = false
            if kind == "relapse" { recovered = res; step = .recover } else { close() }
        }
    }
}

// MARK: sub-views

// Calming coral field — a slow drifting Metal aura (haleAura) layered over the
// original breathing radial base. Anchored high so it halos the headline and
// fades before the CTAs; deliberately low-intensity so it soothes, never alarms.
// ShaderAura self-substitutes a static radial under Reduce Motion.
private struct CoralGlow: View {
    var body: some View {
        ZStack {
            RadialGradient(colors: [Tok.coral.opacity(0.10), .clear],
                           center: UnitPoint(x: 0.5, y: 0.28),
                           startRadius: 20, endRadius: 340)
                .breathing(period: 2.6, scale: 0.97...1.03, opacity: 0.6...1.0)
            ShaderAura(tint: Tok.coral, intensity: 0.55, speed: 0.8)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

private struct RideItOut: View {
    var onSurvived: () -> Void
    var onSlip: () -> Void
    @State private var remaining = 300
    private let total = 300
    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Ring(progress: Double(total - remaining) / Double(total), size: 264, stroke: 12, tone: .coral, breathes: true) {
                VStack(spacing: 4) {
                    Txt.Eyebrow(remaining <= 0 ? "Made it" : "It crests, then fades", color: Tok.coral)
                    Txt.Display(clock(remaining), size: 52)
                        .digitRoll(remaining)
                }
            }
            Txt.Body(reassurance).multilineTextAlignment(.center).padding(.horizontal, Tok.gutter)
            Spacer()
            HButton(label: remaining <= 0 ? "I made it through" : "The craving passed, I'm good",
                    variant: remaining <= 0 ? .primary : .secondary) { Haptics.success(); onSurvived() }
            Button("I slipped") { Haptics.tap(); onSlip() }.font(.sora(.medium, 14)).foregroundStyle(Tok.fg3)
            Disclaimer()
        }
        .padding(.horizontal, Tok.gutter).padding(.bottom, 24)
        .onAppear { tick() }
    }
    private func tick() {
        guard remaining > 0 else { Haptics.success(); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            remaining -= 1
            if remaining % 60 == 0 && remaining > 0 { Haptics.soft() }
            tick()
        }
    }
    private var reassurance: String {
        let p = Double(total - remaining) / Double(total)
        if remaining <= 0 { return "You rode it out. The urge passed, and you're still here." }
        if p < 0.25 { return "This is the peak. It feels loud, but it always crests." }
        if p < 0.6 { return "It's already fading. Stay with the breath." }
        return "Almost through. You're proving you don't need it."
    }
    private func clock(_ s: Int) -> String { s <= 0 ? "0:00" : String(format: "%d:%02d", s / 60, s % 60) }
}

// Box breathing, clock-synced 4-4-4-4: the whole scene derives from one
// TimelineView clock (no dispatch chains to drift). The circle inflates over
// the inhale, holds, deflates over the exhale, holds — with a coral progress
// arc tracing each 4s phase, a 4→1 countdown, and breath haptics on the turns.
private struct BoxBreathing: View {
    var onSurvived: () -> Void
    var onSlip: () -> Void
    @State private var start = Date()
    private let labels = ["Breathe in", "Hold", "Breathe out", "Hold"]

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
                let elapsed = max(0, tl.date.timeIntervalSince(start))
                let cycle = elapsed.truncatingRemainder(dividingBy: 16)
                let phase = min(3, Int(cycle / 4))
                let inPhase = cycle - Double(phase) * 4          // 0…4 within phase
                let f = inPhase / 4                              // 0…1 within phase
                // eased breath position: 0.6…1.0 through in/hold-high/out/hold-low
                let breathe: CGFloat = switch phase {
                case 0: 0.6 + 0.4 * CGFloat(easeInOut(f))
                case 1: 1.0
                case 2: 1.0 - 0.4 * CGFloat(easeInOut(f))
                default: 0.6
                }
                let count = 4 - Int(inPhase)                     // 4,3,2,1

                ZStack {
                    Circle().fill(Tok.coralSoft).frame(width: 220, height: 220).scaleEffect(breathe)
                    Circle().strokeBorder(Tok.coralEdge, lineWidth: 2).frame(width: 220, height: 220).scaleEffect(breathe)
                    // phase progress arc
                    Circle()
                        .trim(from: 0, to: CGFloat(max(f, 0.003)))
                        .stroke(Tok.coral, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 252, height: 252)
                        .opacity(0.8)
                    VStack(spacing: 6) {
                        Txt.H2(labels[phase])
                            .contentTransition(.opacity)
                        Txt.Display("\(count)", size: 44, color: Tok.coral)
                            .digitRoll(count)
                    }
                }
                .onChange(of: phase) { _, p in
                    switch p {
                    case 0: Haptics.breath(.inhale)
                    case 2: Haptics.breath(.exhale)
                    default: Haptics.soft()
                    }
                }
            }
            Txt.Body("In for four, hold for four, out for four, hold for four. Let your shoulders drop.")
                .multilineTextAlignment(.center).padding(.horizontal, Tok.gutter)
            Spacer()
            HButton(label: "I feel steadier, I'm good", variant: .primary) { Haptics.success(); onSurvived() }
            Button("I slipped") { Haptics.tap(); onSlip() }.font(.sora(.medium, 14)).foregroundStyle(Tok.fg3)
            Disclaimer()
        }
        .padding(.horizontal, Tok.gutter).padding(.bottom, 24)
        .onAppear { start = .now; Haptics.breath(.inhale) }
    }

    private func easeInOut(_ t: Double) -> Double { t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2 }
}

private struct CravingLog: View {
    let resolvedBy: String
    var onDone: () -> Void
    @Environment(AppState.self) private var app
    @State private var intensity: Int?
    @State private var trigger: String?
    @State private var context: String?
    private let triggers = ["Stress", "Boredom", "After a meal", "Coffee", "Alcohol", "Driving", "Social", "Phone", "Just woke up", "Work break"]
    private let contexts = ["Home", "Work", "Car", "Out", "With people", "Alone"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Txt.Eyebrow("You made it", color: Tok.accent)
                Txt.H1("That craving\njust passed.")
                Txt.Body("Naming it teaches HALE your triggers, so we get ahead of the next one.")
                Txt.Eyebrow("How strong was it?")
                HStack(spacing: 8) {
                    ForEach(1...5, id: \.self) { i in
                        Button { Haptics.select(); intensity = i } label: {
                            Text("\(i)").font(.sora(.bold, 16))
                                .foregroundStyle(intensity == i ? Tok.accentInk : Tok.fg)
                                .frame(maxWidth: .infinity).frame(height: 48)
                                .background(intensity == i ? Tok.accent : Tok.surface2)
                                .clipShape(RoundedRectangle(cornerRadius: Tok.R.inset, style: .continuous))
                                .accessibilityLabel("Intensity \(i)")
                        }
                    }
                }
                HStack {
                    Txt.Muted("Barely there"); Spacer(); Txt.Muted("Intense")
                }
                Txt.Eyebrow("What set it off?")
                FlowChips(items: triggers, selected: trigger) { trigger = ($0 == trigger) ? nil : $0 }
                Txt.Eyebrow("Where were you?")
                FlowChips(items: contexts, selected: context) { context = ($0 == context) ? nil : $0 }
                HButton(label: "Save & finish", variant: .primary, disabled: intensity == nil) {
                    Task {
                        if let i = intensity {
                            await app.logCraving(intensity: i, trigger: trigger, context: context, resolvedBy: resolvedBy)
                            AnalyticsService.track(.cravingLogged, ["outcome": "survived", "resolvedBy": resolvedBy, "intensity": i])
                        }
                        AnalyticsService.track(.cravingSurvived, ["resolvedBy": resolvedBy]); onDone()
                    }
                }
                Button("Skip") { AnalyticsService.track(.cravingSurvived, ["resolvedBy": resolvedBy]); onDone() }
                    .font(.sora(.medium, 14)).foregroundStyle(Tok.fg3).frame(maxWidth: .infinity)
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 24)
        }
    }
}

private struct RecoverKindly: View {
    let result: RelapseResult?
    var onDone: () -> Void
    var onSage: () -> Void
    @Environment(AppState.self) private var app
    @State private var trigger: String?
    private let triggers = ["Stress", "Boredom", "After a meal", "Coffee", "Alcohol", "Social"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Txt.H1("This isn't\na reset.")
                Txt.Display("Fresh run.", size: 40, color: Tok.accent)
                Txt.Body("Quitting nicotine almost never happens in one clean line. What you've built so far doesn't disappear — it's still yours.")
                Card(pad: true) {
                    HStack(spacing: 12) {
                        Tile(k: "Saved · lifetime", v: money(result?.lifetimeMoneySaved ?? 0), accent: true)
                        Tile(k: "Best streak", v: "\(result?.bestStreak ?? 0)d")
                    }
                }
                SageNote(message: (result?.bestStreak ?? 0) >= 2
                    ? "You already proved you can do this for \(result?.bestStreak ?? 0) days. You can do it again, starting now."
                    : "Starting is the hardest part, and you've already done it once. Do it again, right now.", chip: false)
                Txt.Eyebrow("What pulled you back?")
                FlowChips(items: triggers, selected: trigger) { trigger = ($0 == trigger) ? nil : $0 }
                HButton(label: "Reflect with Sage", variant: .primary) {
                    AnalyticsService.track(.relapseRecovered, trigger.map { ["trigger": $0] } ?? [:])
                    onSage()
                }
                HButton(label: "Start my fresh run", variant: .secondary) {
                    Task {
                        if let t = trigger {
                            await app.noteRelapseTrigger(t)
                            AnalyticsService.track(.relapseTriggerNamed, ["trigger": t])
                        }
                        AnalyticsService.track(.relapseRecovered, trigger.map { ["trigger": $0] } ?? [:])
                        Haptics.success(); onDone()
                    }
                }
                Disclaimer()
            }
            .padding(.horizontal, Tok.gutter).padding(.vertical, 24)
        }
    }
    private func money(_ v: Double) -> String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.maximumFractionDigits = v < 100 ? 2 : 0
        return f.string(from: NSNumber(value: v)) ?? "$0"
    }
}

// Simple wrapping chip row.
private struct FlowChips: View {
    let items: [String]
    let selected: String?
    let onTap: (String) -> Void
    private let cols = [GridItem(.adaptive(minimum: 100), spacing: 8)]
    var body: some View {
        LazyVGrid(columns: cols, alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Chip(label: item, on: selected == item) { onTap(item) }
            }
        }
    }
}

private struct Disclaimer: View {
    var body: some View {
        Text("HALE is supportive, not medical advice. In crisis, call or text 988 (US).")
            .font(.sora(.regular, 12)).foregroundStyle(Tok.fg3)
            .onTapGesture { if let u = URL(string: "tel:988") { UIApplication.shared.open(u) } }
            .padding(.top, 4)
    }
}
