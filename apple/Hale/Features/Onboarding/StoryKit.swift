import SwiftUI
import Pow

// Shared story-scene vocabulary for the cinematic onboarding: Sage's narrated
// lines, page-turn transitions, the count-up numeral, the plan-building
// checklist, the reveal burst, and the floating glass CTA dock.

// Grouped integer for the money beats ("9125" → "9,125"), so the reveal reads
// big and clean. Onboarding hard-codes the "$" prefix (savings are conceptual),
// so this only adds the thousands separator rather than a locale currency symbol.
enum Money {
    private static let fmt: NumberFormatter = {
        let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0
        return f
    }()
    static func grouped(_ n: Int) -> String { fmt.string(from: NSNumber(value: n)) ?? "\(n)" }
}

// MARK: - Scene transitions

extension AnyTransition {
    /// Step→step inside the quiz: a soft page-turn — blur-dissolve with depth.
    static var storyStep: AnyTransition {
        .asymmetric(
            insertion: AnyTransition.movingParts.blur
                .combined(with: .opacity)
                .combined(with: .offset(y: 18))
                .animation(.easeOut(duration: 0.5).delay(0.12)),
            removal: AnyTransition.movingParts.blur
                .combined(with: .opacity)
                .combined(with: .offset(y: -12))
                .animation(.easeIn(duration: 0.22))
        )
    }

    /// Chapter→chapter (welcome→quiz, building→reveal…): fade in from darkness.
    static var storyBeat: AnyTransition {
        .asymmetric(
            insertion: AnyTransition.movingParts.filmExposure
                .animation(.easeOut(duration: 0.9).delay(0.15)),
            removal: AnyTransition.movingParts.blur
                .combined(with: .opacity)
                .animation(.easeIn(duration: 0.3))
        )
    }
}

// MARK: - Sage, the narrator

/// A narrated Sage line: words surface one by one out of the haze
/// (blur → sharp, rise + fade), like a voice finding its shape.
struct NarratorText: View {
    let line: String
    var delay: Double = 0.25
    var color: Color = Tok.fg2
    @State private var shown = false

    var body: some View {
        WrapWords(spacing: 5, lineSpacing: 4) {
            let words = line.split(separator: " ").map(String.init)
            ForEach(Array(words.enumerated()), id: \.offset) { i, w in
                Text(w)
                    .font(.sora(.regular, 16))
                    .foregroundStyle(color)
                    .opacity(shown ? 1 : 0)
                    .blur(radius: shown ? 0 : 5)
                    .offset(y: shown ? 0 : 7)
                    .animation(Springs.rise.delay(delay + Double(i) * 0.045), value: shown)
            }
        }
        .onAppear { shown = true }
    }
}

/// Minimal wrapping layout so each word can animate independently.
struct WrapWords: Layout {
    var spacing: CGFloat = 5
    var lineSpacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = layout(subviews: subviews, width: proposal.width ?? .infinity)
        let h = rows.last.map { $0.y + $0.height } ?? 0
        return CGSize(width: proposal.width ?? rows.map(\.maxX).max() ?? 0, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var i = 0
        for row in layout(subviews: subviews, width: bounds.width) {
            for frame in row.frames {
                subviews[i].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + row.y),
                                  proposal: ProposedViewSize(frame.size))
                i += 1
            }
        }
    }

    private struct Row { var frames: [CGRect] = []; var y: CGFloat = 0; var height: CGFloat = 0
        var maxX: CGFloat { frames.last?.maxX ?? 0 } }

    private func layout(subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        var x: CGFloat = 0, y: CGFloat = 0
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if x > 0, x + s.width > width {
                rows.append(row)
                y += row.height + lineSpacing
                row = Row(frames: [], y: y, height: 0)
                x = 0
            }
            row.frames.append(CGRect(x: x, y: 0, width: s.width, height: s.height))
            row.y = y
            row.height = max(row.height, s.height)
            x += s.width + spacing
        }
        if !row.frames.isEmpty { rows.append(row) }
        return rows
    }
}

// MARK: - Count-up numeral (the reveal's centerpiece)

struct CountUpDisplay: View {
    let target: Int
    var prefix = "$"
    var size: CGFloat = 64
    var color: Color = Tok.accent
    var duration: Double = 1.5
    var startDelay: Double = 0.35
    var onLand: (() -> Void)? = nil

    @State private var start: Date?
    @State private var landed = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 40.0, paused: landed)) { tl in
            let t: Double = {
                guard let s = start else { return 0 }
                return min(1, max(0, tl.date.timeIntervalSince(s) / duration))
            }()
            let eased = 1 - pow(1 - t, 4)
            Txt.Display("\(prefix)\(Money.grouped(Int(Double(target) * eased)))", size: size, color: color)
                .scaleEffect(landed ? 1 : 0.985 + 0.015 * eased, anchor: .leading)
        }
        .onAppear {
            start = Date().addingTimeInterval(startDelay)
            DispatchQueue.main.asyncAfter(deadline: .now() + startDelay + duration) {
                guard !landed else { return }
                landed = true
                onLand?()
            }
        }
    }
}

// MARK: - The plan-building beat

/// Suspense checklist: lines tick in one by one with soft haptics, then `onDone`.
struct BuildChecklist: View {
    let lines: [String]
    var stepEvery: Double = 0.62
    var onDone: () -> Void
    @State private var done = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                HStack(spacing: 12) {
                    ZStack {
                        Circle().strokeBorder(i < done ? Tok.accentEdge : Tok.stroke2, lineWidth: 1.5)
                            .frame(width: 22, height: 22)
                        if i < done {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(Tok.accent)
                                .transition(.movingParts.pop(Tok.accent))
                        }
                    }
                    Text(line)
                        .font(.sora(.medium, 15))
                        .foregroundStyle(i < done ? Tok.fg : Tok.fg3)
                }
                .opacity(i <= done ? 1 : 0.35)
            }
        }
        .onAppear { tick() }
    }

    private func tick() {
        guard done < lines.count else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) { onDone() }
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + stepEvery) {
            withAnimation(Springs.rise) { done += 1 }
            Haptics.soft()
            tick()
        }
    }
}

// MARK: - Reveal burst (one-shot emerald confetti)

struct RevealBurst: View {
    @State private var born: Date?
    private let life: Double = 1.9

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 40.0)) { tl in
            Canvas { ctx, size in
                guard let b = born else { return }
                let t = min(1, tl.date.timeIntervalSince(b) / life)
                guard t < 1 else { return }
                let origin = CGPoint(x: size.width / 2, y: size.height * 0.32)
                for i in 0..<44 {
                    let s = Double(i)
                    let ang = (s * 0.618).truncatingRemainder(dividingBy: 1) * 2 * .pi
                    let power = 90 + (s * 0.271).truncatingRemainder(dividingBy: 1) * 190
                    let ease = 1 - pow(1 - t, 3)
                    let x = origin.x + cos(ang) * power * ease
                    let y = origin.y + sin(ang) * power * ease * 0.75 + 190 * t * t
                    let rot = t * (3 + (s * 0.383).truncatingRemainder(dividingBy: 1) * 5) + s
                    let color: Color = i % 4 == 0 ? Tok.accent2 : (i % 4 == 1 ? Tok.warm : Tok.accent)
                    var p = Path(CGRect(x: -2.6, y: -4.4, width: 5.2, height: 8.8))
                    p = p.applying(.init(translationX: x, y: y).rotated(by: rot))
                    ctx.fill(p, with: .color(color.opacity((1 - t) * 0.95)))
                }
            }
        }
        .allowsHitTesting(false)
        .onAppear { born = Date() }
    }
}

// MARK: - Metal shader effects (OnboardingShaders.metal)

/// A subtle, continuous emerald caustic played over its content via a Metal
/// `colorEffect` (`ShaderLibrary.emeraldAurora`) — the reveal/commit money cards
/// come alive with flowing light at the story's peak. Off under Reduce Motion.
struct AuroraShimmer: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var active: Bool
    func body(content: Content) -> some View {
        if active && !reduceMotion {
            TimelineView(.animation) { tl in
                let t = tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600)
                content.visualEffect { view, proxy in
                    view.colorEffect(ShaderLibrary.emeraldAurora(.float2(proxy.size), .float(t)))
                }
            }
        } else {
            content
        }
    }
}

/// A gentle Metal heat-haze displacement (`distortionEffect` → `hazeDistort`):
/// the haze literally shimmers, then eases to nothing as the plan resolves.
struct HazeDistort: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var amount: CGFloat
    func body(content: Content) -> some View {
        if amount > 0.1 && !reduceMotion {
            TimelineView(.animation) { tl in
                let t = tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600)
                content.visualEffect { view, _ in
                    view.distortionEffect(
                        ShaderLibrary.hazeDistort(.float(t), .float(Float(amount))),
                        maxSampleOffset: CGSize(width: amount, height: amount))
                }
            }
        } else {
            content
        }
    }
}

extension View {
    /// Living emerald light over money cards at the story's peak (Metal colorEffect).
    func auroraShimmer(_ active: Bool = true) -> some View { modifier(AuroraShimmer(active: active)) }
    /// Heat-haze shimmer, `amount` = max displacement in points (Metal distortionEffect).
    func hazeDistort(_ amount: CGFloat) -> some View { modifier(HazeDistort(amount: amount)) }
}

// MARK: - Floating glass CTA dock (Liquid Glass, iOS 26 baseline)

/// The story scenes float their CTA on Liquid Glass so the atmosphere keeps
/// breathing underneath — unlike the app's solid-floor CtaDock.
struct StoryDock<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 8) { content }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .haleGlassPanel(radius: 30, stroked: false)
            .padding(.horizontal, Tok.gutter)
            .padding(.bottom, 14)
    }
}
