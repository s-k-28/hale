import SwiftUI

// ScrollFX — the one reusable scroll-motion layer for HALE. Additive, composable
// modifiers that make any list scroll like Oura / Things: content reveals as it
// enters from the bottom, demotes (fades + softens) as it leaves the top, hero
// covers drift with parallax, and tabs cross-fade. Built on iOS 26
// `scrollTransition` + `visualEffect`.
//
// Design rules honored:
//  • ONE physical language, calm timing (MOTION SPEC): scroll-in opacity 0.35→1,
//    +8pt rise, scale 0.98→1.0; demote fade→~0.5 + ~1.5pt blur; tab cross-fade 220ms.
//  • Reduce Motion → every effect collapses to identity/final (no fades, no blur,
//    no drift). Nothing here changes layout or data — light and motion only.
//  • Zero cost off-screen: scrollTransition only evaluates near the viewport.
//  • Composes with the existing .riseIn / .breathing (temporally disjoint).
//
// ScrollTransitionPhase.value is -1 (topLeading, above/exiting) … 0 (identity,
// centered) … 1 (bottomTrailing, below/entering). We scope each effect to a
// single edge so reveal and demote never fight over the same pixels.

// MARK: - 1. Reveal — content rises into place as it enters from the bottom
// Superset of a plain on-appear reveal: a first-paint staggered entrance (so it
// drops in for `.riseIn`-style adoption anywhere) PLUS a scroll-linked reveal
// from the bottom edge when inside a ScrollView. Same signature screens already
// call; scrollTransition is a harmless no-op outside a scroll view.

private struct HaleScrollReveal: ViewModifier {
    let index: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    func body(content: Content) -> some View {
        if reduceMotion {
            content                                   // final values, no motion
        } else {
            content
                .scrollTransition(axis: .vertical) { view, phase in
                    let e = max(0, phase.value)        // 1 entering from bottom … 0 at rest
                    return view
                        .opacity(1 - 0.65 * e)         // 0.35 → 1
                        .offset(y: 8 * e)              // +8 → 0
                        .scaleEffect(1 - 0.02 * e, anchor: .top)   // 0.98 → 1
                }
                .opacity(appeared ? 1 : 0.35)
                .offset(y: appeared ? 0 : 8)
                .scaleEffect(appeared ? 1 : 0.98, anchor: .top)
                .onAppear {
                    withAnimation(.easeOut(duration: 0.3).delay(Double(index) * 0.04)) {
                        appeared = true
                    }
                }
        }
    }
}

// MARK: - 2. Demote — items fade and soften as they leave the top edge

private struct HaleScrollDemote: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content.scrollTransition(axis: .vertical) { view, phase in
                let x = max(0, -phase.value)           // 1 exiting the top … 0 at rest
                return view
                    .opacity(1 - 0.5 * x)              // 1 → 0.5
                    .blur(radius: 1.5 * x)            // 0 → 1.5pt, barely there
            }
        }
    }
}

// MARK: - 3. Parallax — hero/cover drifts at a fraction of scroll speed

private struct HaleParallax: ViewModifier {
    let strength: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion || strength == 0 {
            content
        } else {
            content.scrollTransition(axis: .vertical) { view, phase in
                view.offset(y: phase.value * strength)   // drifts with scroll position
            }
        }
    }
}

// MARK: - 4. Tab transition — cross-fade content on tab change, never a slide

private struct HaleTabTransition<Selection: Hashable>: ViewModifier {
    let selection: Selection
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .id(selection)   // identity change drives insertion/removal
            .transition(reduceMotion
                        ? .opacity
                        : .opacity.combined(with: .offset(y: 4)))   // fade + 4pt settle
            .animation(.easeOut(duration: reduceMotion ? 0.20 : 0.22), value: selection)
            .onChange(of: selection) { _, _ in Haptics.select() }
    }
}

// MARK: - Public API

extension View {
    /// Rows/cards rise into place as they scroll in from the bottom, and stagger
    /// on first paint (40ms × `index`). Replaces manual `.riseIn` on scrolled
    /// content. Reduce Motion → shown at final values.
    func haleScrollReveal(_ index: Int = 0) -> some View {
        modifier(HaleScrollReveal(index: index))
    }

    /// Content fades to ~0.5 and softens (~1.5pt blur) as it leaves the top edge,
    /// so focus stays on what's arriving. Reduce Motion → no change.
    func haleScrollDemote() -> some View {
        modifier(HaleScrollDemote())
    }

    /// A hero/cover image drifts at a fraction of scroll speed. `strength` is the
    /// peak drift in points (≈24–36 for banners). Reduce Motion → static.
    func haleParallax(_ strength: CGFloat = 28) -> some View {
        modifier(HaleParallax(strength: strength))
    }

    /// Cross-fades tab content (220ms, +4pt settle — never a slide) when
    /// `selection` changes, with a select haptic. Place on the content inside a
    /// switch-based tab router. Reduce Motion → plain 200ms cross-fade.
    func haleTabTransition<S: Hashable>(_ selection: S) -> some View {
        modifier(HaleTabTransition(selection: selection))
    }
}
