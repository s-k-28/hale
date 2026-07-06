import SwiftUI

// Phase 1 component gallery — renders every design-system primitive for the
// screenshot review vs the RN app. `GalleryContent` is factored out so it can be
// rendered full-height by ImageRenderer (see SnapshotRunner) as well as scrolled.
struct GalleryView: View {
    // Screenshot helper: launch with SIMCTL_CHILD_HALE_SCROLL=a0|a1|a2 to jump the
    // scroll to a section anchor for gate-review captures.
    var body: some View {
        ZStack {
            HaleBackdrop()
            ScrollViewReader { proxy in
                ScrollView { GalleryContent() }
                    .onAppear {
                        guard let anchor = ProcessInfo.processInfo.environment["HALE_SCROLL"] else { return }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                            proxy.scrollTo(anchor, anchor: .top)
                        }
                    }
            }
        }
    }
}

struct GalleryContent: View {
    @State private var chipOn = true
    @State private var opt = 1
    @State private var field = ""
    @State private var numField = "12"
    @State private var ringSurge = 0
    @State private var fxTab = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 34) {
            header.id("a0")
            scrollFXSection
            typographySection
            buttonSection
            controlSection
            cardSection
            inputSection
            progressSection
            ringSection
            sageAndLockSection
        }
        .padding(.horizontal, Tok.gutter)
        .padding(.top, 24)
        .padding(.bottom, 60)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sectionLabel(_ s: String) -> some View {
        Txt.Eyebrow(s, color: Tok.accent).padding(.bottom, 2)
    }

    // MARK: ScrollFX demo — reveal / demote / parallax / tab cross-fade.
    // Anchors a1 (top) and a2 (mid) land inside this section for HALE_SCROLL captures.
    private var scrollFXSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Scroll motion").id("a1")
            Txt.Muted("Rows reveal as they enter from the bottom and demote — fade + a soft blur — as they leave the top. Reduce Motion freezes them at rest.")
            parallaxBanner
            tabFadeDemo
            ForEach(0..<14, id: \.self) { i in
                let row = fxRow(i).haleScrollReveal(i).haleScrollDemote()
                if i == 8 { row.id("a2") } else { row }
            }
        }
    }

    private func fxRow(_ i: Int) -> some View {
        let icons = ["flame.fill", "wind", "leaf.fill", "heart.fill", "bolt.fill", "star.fill"]
        return Card(pad: true) {
            HStack(spacing: 14) {
                Image(systemName: icons[i % icons.count])
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Tok.accent)
                    .frame(width: 36, height: 36)
                    .background(Tok.accentSoft, in: RoundedRectangle(cornerRadius: Tok.R.inset, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Row \(i + 1)").font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                    Text("Reveals in · demotes out").font(.sora(.regular, 12)).foregroundStyle(Tok.fg2)
                }
                Spacer()
                Text("\(i * 3)d").font(.sora(.bold, 15)).foregroundStyle(Tok.accent)
            }
        }
    }

    private var parallaxBanner: some View {
        ZStack {
            LinearGradient(colors: [Tok.accentDeep, Tok.accent],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            Text("Parallax cover").font(.sora(.bold, 18)).foregroundStyle(Tok.accentInk)
        }
        .frame(height: 120)
        .clipShape(RoundedRectangle(cornerRadius: Tok.R.panel, style: .continuous))
        .haleParallax(26)
    }

    private var tabFadeDemo: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("", selection: $fxTab) {
                Text("Today").tag(0); Text("Squad").tag(1); Text("You").tag(2)
            }
            .pickerStyle(.segmented)
            Card(pad: true) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(["Today", "Squad", "You"][fxTab])
                        .font(.sora(.semibold, 16)).foregroundStyle(Tok.fg)
                    Text(["Your clean streak and today's check-in.",
                          "Your buddy's streak, side by side.",
                          "Your lifetime progress and settings."][fxTab])
                        .font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .haleTabTransition(fxTab)   // cross-fade, no slide
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Txt.Eyebrow("Clean Dark · v2")
            Txt.H1("Component gallery")
            Txt.Body("Native SwiftUI port · Phase 1")
        }
    }

    private var typographySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Type ramp")
            Txt.Display("88", size: 88)
            Txt.H1("H1 · Build my quit plan")
            Txt.H2("H2 · Money saved")
            Txt.H3("H3 · Next milestone")
            Txt.Lead("Lead · a calmer way through the craving.")
            Txt.Body("Body · you've stayed clean and it's paying off.")
            Txt.Muted("Muted · tap to check in for today.")
        }
    }

    private var buttonSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Buttons")
            HButton(label: "Primary CTA", variant: .primary, icon: "checkmark")
            HButton(label: "Secondary", variant: .secondary)
            HButton(label: "Ghost", variant: .ghost)
            HStack(spacing: 12) {
                HButton(label: "Coral", variant: .coral)
                HButton(label: "Warm", variant: .warm)
            }
            HStack(spacing: 12) {
                HButton(label: "Small", variant: .primary, sm: true)
                HButton(label: "Loading", variant: .primary, loading: true)
                HButton(label: "Disabled", variant: .primary, disabled: true)
            }
        }
    }

    private var controlSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Controls")
            HStack(spacing: 10) {
                Chip(label: "Selected", on: chipOn) { chipOn.toggle() }
                Chip(label: "Off", on: false) {}
                IconBtn(systemName: "chevron.left")
                IconBtn(systemName: "xmark")
            }
            OptRow(label: "Vape", sub: "Disposable or pod", on: opt == 0, icon: "wind") { opt = 0 }
            OptRow(label: "Pouches", sub: "Nicotine pouches", on: opt == 1, icon: "leaf.fill") { opt = 1 }
            HStack(spacing: 8) {
                Badge(label: "Soft", tone: .soft)
                Badge(label: "Solid", tone: .solid)
                Badge(label: "Warm", tone: .warm)
            }
        }
    }

    private var cardSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Cards & tiles")
            Card(pad: true) { Txt.Body("Card — surface, hairline, r22.", color: Tok.fg) }
            CardHero(pad: true) { Txt.Body("CardHero — the one accent-edged card.", color: Tok.fg) }
            CardInk(pad: true) { Txt.Body("CardInk — bg-2 inset panel.", color: Tok.fg) }
            HStack(spacing: 12) {
                Tile(k: "Day streak", v: "12")
                Tile(k: "Saved", v: "$148", accent: true)
            }
        }
    }

    private var inputSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionLabel("Inputs")
            Input(text: $field, placeholder: "Your first name")
            UnderlineInput(text: $numField, filled: !numField.isEmpty, suffix: "a day")
        }
    }

    private var progressSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionLabel("Progress")
            Track(progress: 0.62, tone: .accent)
            Track(progress: 0.4, tone: .warm)
            Track(progress: 0.25, tone: .coral)
            Steps(total: 7, current: 3)
        }
    }

    private var ringSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Ring")
            HStack {
                Spacer()
                Ring(progress: 0.68, size: 200, surge: ringSurge) {
                    VStack(spacing: 2) {
                        Txt.Display("12", size: 64)
                        Txt.Eyebrow("days clean")
                    }
                }
                Spacer()
            }
            HButton(label: "Fire surge", variant: .secondary, sm: true) { ringSurge += 1 }
        }
    }

    private var sageAndLockSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionLabel("Sage & premium")
            SageNote(message: "One craving at a time. You already made it through the hardest hour yesterday.")
            LockedFeature(feature: "insights", variant: .inline,
                          title: "Unlock with HALE+",
                          subtitle: "See your craving patterns and recovery trend.") {
                Color.clear
            }
        }
    }
}
