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
            Tok.bg.ignoresSafeArea()
            switch step {
            case .home:       home
            case .ride:       RideItOut { resolvedBy = "timer"; step = .log } onSlip: { step = .slipChoose }
            case .breathe:    BoxBreathing { resolvedBy = "breathing"; step = .log } onSlip: { step = .slipChoose }
            case .log:        CravingLog(resolvedBy: resolvedBy, onDone: close)
            case .slipChoose: slipChoose
            case .recover:    RecoverKindly(result: recovered, onDone: close, onSage: sageAndClose)
            }
        }
        .onAppear { Haptics.heavy(); AnalyticsService.track(.sosOpened) }
    }

    private func close() { dismiss() }
    private func sageAndClose() { dismiss() /* Coach tab focus handled by root in a later pass */ }

    private var home: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                HStack(spacing: 8) { Circle().fill(Tok.coral).frame(width: 8, height: 8); Txt.Eyebrow("Craving SOS", color: Tok.coral) }
                Spacer()
                IconBtn(systemName: "xmark") { dismiss() }
            }
            Spacer()
            Txt.H1("You're not\nin danger.")
            Txt.Display("This passes.", size: 44, color: Tok.coral)
            Txt.Body("A craving peaks in a few minutes, then fades — whether or not you act on it. Pick one:")
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
        VStack(alignment: .leading, spacing: 14) {
            HStack { Spacer(); IconBtn(systemName: "xmark") { step = .home } }
            Spacer()
            Txt.H1("Slips are part\nof quitting.")
            Txt.Display("Not the end.", size: 40, color: Tok.accent)
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
            AnalyticsService.track(.relapseLogged, ["kind": kind])
            if kind == "relapse" { recovered = res; step = .recover } else { close() }
        }
    }
}

// MARK: sub-views

private struct RideItOut: View {
    var onSurvived: () -> Void
    var onSlip: () -> Void
    @State private var remaining = 300
    private let total = 300
    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Ring(progress: Double(total - remaining) / Double(total), size: 264, stroke: 12) {
                VStack(spacing: 4) {
                    Txt.Eyebrow(remaining <= 0 ? "Made it" : "It crests, then fades", color: Tok.coral)
                    Txt.Display(clock(remaining), size: 52)
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

private struct BoxBreathing: View {
    var onSurvived: () -> Void
    var onSlip: () -> Void
    @State private var phase = 0
    @State private var scale: CGFloat = 0.6
    private let labels = ["Breathe in", "Hold", "Breathe out", "Hold"]
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle().fill(Tok.coralSoft).frame(width: 220, height: 220).scaleEffect(scale)
                Circle().strokeBorder(Tok.coralEdge, lineWidth: 2).frame(width: 220, height: 220).scaleEffect(scale)
                Txt.H2(labels[phase])
            }
            .animation(.easeInOut(duration: 4), value: scale)
            Txt.Body("In for four, hold for four, out for four, hold for four. Let your shoulders drop.")
                .multilineTextAlignment(.center).padding(.horizontal, Tok.gutter)
            Spacer()
            HButton(label: "I feel steadier, I'm good", variant: .primary) { Haptics.success(); onSurvived() }
            Button("I slipped") { Haptics.tap(); onSlip() }.font(.sora(.medium, 14)).foregroundStyle(Tok.fg3)
            Disclaimer()
        }
        .padding(.horizontal, Tok.gutter).padding(.bottom, 24)
        .onAppear { cycle() }
    }
    private func cycle() {
        if phase == 0 { scale = 1.0; Haptics.breath(.inhale) }
        else if phase == 2 { scale = 0.6; Haptics.breath(.exhale) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { phase = (phase + 1) % 4; cycle() }
    }
}

private struct CravingLog: View {
    let resolvedBy: String
    var onDone: () -> Void
    @Environment(AppState.self) private var app
    @State private var intensity: Int?
    @State private var trigger: String?
    private let triggers = ["Stress", "Boredom", "After a meal", "Coffee", "Alcohol", "Driving", "Social", "Phone"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Txt.Eyebrow("You made it", color: Tok.accent)
                Txt.H1("That craving\njust passed.")
                Txt.Body("Naming it teaches HALE your triggers, so we get ahead of the next one.")
                Txt.Eyebrow("Intensity")
                HStack(spacing: 8) {
                    ForEach(1...5, id: \.self) { i in
                        Button { Haptics.select(); intensity = i } label: {
                            Text("\(i)").font(.sora(.bold, 16))
                                .foregroundStyle(intensity == i ? Tok.accentInk : Tok.fg)
                                .frame(maxWidth: .infinity).frame(height: 48)
                                .background(intensity == i ? Tok.accent : Tok.surface2)
                                .clipShape(RoundedRectangle(cornerRadius: Tok.R.inset, style: .continuous))
                        }
                    }
                }
                Txt.Eyebrow("Trigger")
                FlowChips(items: triggers, selected: trigger) { trigger = ($0 == trigger) ? nil : $0 }
                HButton(label: "Save & finish", variant: .primary, disabled: intensity == nil) {
                    Task {
                        if let i = intensity { await app.logCraving(intensity: i, trigger: trigger, context: nil, resolvedBy: resolvedBy) }
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
                HButton(label: "Reflect with Sage", variant: .primary) { onSage() }
                HButton(label: "Start my fresh run", variant: .secondary) {
                    Task { if let t = trigger { await app.noteRelapseTrigger(t) }; Haptics.success(); onDone() }
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
