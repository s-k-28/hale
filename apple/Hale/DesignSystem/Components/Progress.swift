import SwiftUI

// Ported from src/ui/Track.tsx, Steps.tsx, Ring.tsx.

enum TrackTone { case accent, warm, coral }

struct Track: View {
    var progress: Double          // 0...1
    var tone: TrackTone = .accent
    @State private var w: CGFloat = 0

    private var fill: Color { switch tone { case .accent: Tok.accent; case .warm: Tok.warm; case .coral: Tok.coral } }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Tok.track)
                Capsule().fill(fill).frame(width: geo.size.width * w)
            }
        }
        .frame(height: 8)
        .onAppear { withAnimation(Springs.trackFill) { w = clamp(progress) } }
        .onChange(of: progress) { _, p in withAnimation(Springs.trackFill) { w = clamp(p) } }
    }
    private func clamp(_ v: Double) -> CGFloat { CGFloat(min(max(v, 0), 1)) }
}

struct Steps: View {
    let total: Int
    let current: Int
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<total, id: \.self) { i in
                Capsule()
                    .fill(i < current ? Tok.accentDeep : (i == current ? Tok.accent : Tok.track))
                    .frame(width: i == current ? 32 : 16, height: 5)
            }
        }
    }
}

// Circular progress ring — Circle().trim + diagonal gradient + glow, spring on
// progress, and a scale "pop" when `surge` increments. `breathes` adds a living
// aura behind the ring (Today hero); `tone` recolors for the SOS coral lane.
enum RingTone { case accent, coral }

struct Ring<Content: View>: View {
    var progress: Double
    var size: CGFloat = 240
    var stroke: CGFloat = 9
    var surge: Int = 0
    var tone: RingTone = .accent
    var breathes: Bool = false
    @ViewBuilder var content: Content

    @State private var p: Double = 0
    @State private var pop: Double = 0

    private var inset: CGFloat { stroke / 2 + 3 }   // matches r = (size-stroke)/2 - 3
    private var gradient: [Color] {
        switch tone {
        case .accent: [Tok.accentDeep, Tok.accent2]
        case .coral:  [Tok.coral.opacity(0.65), Tok.coral]
        }
    }
    private var glow: Color { tone == .accent ? Tok.accent : Tok.coral }

    var body: some View {
        ZStack {
            if breathes {
                // living aura: a soft radial field that slowly inhales/exhales
                RadialGradient(colors: [glow.opacity(0.16), .clear],
                               center: .center, startRadius: size * 0.22, endRadius: size * 0.62)
                    .frame(width: size * 1.3, height: size * 1.3)
                    .breathing(period: 3.6, scale: 0.95...1.05, opacity: 0.55...1.0)
                    .allowsHitTesting(false)
            }
            Circle()
                .stroke(Color.rgba(255, 255, 255, 0.06), lineWidth: stroke)
            Circle()
                .trim(from: 0, to: CGFloat(min(max(p, 0.001), 1)))
                .stroke(
                    LinearGradient(colors: gradient,
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    style: StrokeStyle(lineWidth: stroke, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .shadow(color: glow.opacity(0.22), radius: 6)
            content
        }
        .padding(inset)
        .frame(width: size, height: size)
        .scaleEffect(1 + pop * 0.03)
        .onAppear { withAnimation(Springs.ring) { p = progress } }
        .onChange(of: progress) { _, v in withAnimation(Springs.ring) { p = v } }
        .onChange(of: surge) { _, _ in
            withAnimation(.easeInOut(duration: 0.14)) { pop = 1 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
                withAnimation(.interpolatingSpring(mass: 1, stiffness: 120, damping: 14)) { pop = 0 }
            }
        }
    }
}
