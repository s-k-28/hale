import SwiftUI
import Combine
import Pow

// The onboarding quiz — phase machine (questions → building → reveal → commit →
// push → invite). Answers live in local state until commit (deferred sign-up).
// Savings/milestones use the ported Plan model. Mirrors (onboarding)/quiz.tsx.
//
// Cinematic layer: each phase/step is a SCENE on the shared onboarding
// atmosphere (owned by OnboardingFlow, driven through the bindings below).
// Sage narrates every beat; the HeroOrb through-line pulses with each answer
// and clears as the haze burns off. Data flow + Convex commit sequence are
// unchanged from the original implementation.
struct QuizView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    /// Scene atmosphere reported up to OnboardingFlow's shared backdrop.
    @Binding var atmosphere: Atmosphere
    @Binding var parallax: CGFloat
    /// Back out of step 0 (chapter switch); falls back to dismiss when pushed.
    var onExit: (() -> Void)? = nil

    private enum Phase { case questions, building, reveal, commit, push, invite }

    struct Product {
        let value, label, icon, q2Title, q3Title, q3Eyebrow: String
        let q2Options: [(String, String, Double)]   // label, sub, unitsPerDay
        let q2Eyebrow, q2Suffix: String
        let costDivisor: Double                       // 0 == "perDay"
    }
    private let products: [Product] = [
        .init(value: "vape", label: "Vape / e-cig", icon: "wind",
              q2Title: "How often do you go through a vape or pod?", q3Title: "What does one usually cost you?",
              q3Eyebrow: "Cost per vape / pod",
              q2Options: [("More than one a day", "", 1.5), ("About one a day", "", 1), ("One every 2–3 days", "", 0.4), ("One or two a week", "", 0.2), ("A few a month", "", 0.1)],
              q2Eyebrow: "", q2Suffix: "", costDivisor: 1),
        .init(value: "pouch", label: "Nicotine pouches", icon: "circle.grid.2x2.fill",
              q2Title: "How many pouches a day?", q3Title: "What does a tin cost?", q3Eyebrow: "Cost per tin",
              q2Options: [], q2Eyebrow: "pouches per day", q2Suffix: "a day", costDivisor: 15),
        .init(value: "cig", label: "Cigarettes", icon: "smoke.fill",
              q2Title: "How much do you smoke a day?", q3Title: "What does a pack cost where you live?", q3Eyebrow: "Cost per pack",
              q2Options: [("A few a day", "1–5 cigarettes", 4), ("Around half a pack", "about 10 a day", 10), ("About a pack a day", "about 20", 20), ("Around two packs", "about 40", 40), ("More than two packs", "it adds up fast", 60)],
              q2Eyebrow: "", q2Suffix: "", costDivisor: 20),
        .init(value: "mixed", label: "A mix of things", icon: "shuffle",
              q2Title: "How many times a day do you reach for nicotine?", q3Title: "About how much do you spend a day?", q3Eyebrow: "Spend per day",
              q2Options: [], q2Eyebrow: "times per day", q2Suffix: "times a day", costDivisor: 0),
    ]
    private let triggerChoices = ["Stress", "Boredom", "After meals", "Coffee", "Alcohol", "Driving", "Social", "Scrolling", "Waking up", "Work breaks"]
    private let hourBands: [(Int, String)] = [(7, "Early morning"), (10, "Mid-morning"), (13, "Midday"), (16, "Afternoon"), (19, "Evening"), (22, "Late night")]
    private let motivations: [(String, String, String)] = [("health", "My health", "heart.fill"), ("money", "Save money", "dollarsign.circle.fill"), ("family", "My family / kids", "person.2.fill"), ("freedom", "Feel free of it", "bird.fill"), ("fitness", "Fitness / breathing", "wind"), ("control", "Take back control", "location.north.circle.fill")]

    @State private var phase: Phase = .questions
    @State private var stepIndex = 0
    @State private var productType: String?
    @State private var perDay: Double?
    @State private var unitCost: Double?
    @State private var triggers: [String] = []
    @State private var hardestHour: Int?
    @State private var motivation = ""
    @State private var name = ""
    @State private var perDayText = ""
    @State private var unitCostText = ""
    @State private var submitting = false
    @State private var showPaywall = false
    @State private var customTrigger = ""
    @State private var customHour = ""
    @State private var customMotivation = ""

    // Cinematic state (visual only — never feeds the committed answers).
    @State private var answerPulse = 0        // orb ripple per answer
    @State private var revealShine = 0        // hero-card shine after count-up
    @State private var revealBurst = 0        // one-shot confetti key
    @State private var commitShine = 0        // CTA sheen loop on the commit scene
    private let sheenTimer = Timer.publish(every: 3.2, on: .main, in: .common).autoconnect()

    private var product: Product { products.first { $0.value == productType } ?? products[0] }

    var body: some View {
        ZStack {
            switch phase {
            case .questions: questions.transition(.storyBeat)
            case .building:  building.transition(.storyBeat)
            case .reveal:    reveal.transition(.storyBeat)
            case .commit:    commitScreen.transition(.storyBeat)
            case .push:      pushStep.transition(.storyBeat)
            case .invite:    inviteStep.transition(.storyBeat)
            }
        }
        .navigationBarBackButtonHidden(true)
        // Onboarding paywall peak (§7.1): shown right after commit; dismiss → push step.
        .fullScreenCover(isPresented: $showPaywall,
                         onDismiss: { withAnimation(.easeInOut(duration: 0.5)) { phase = .push } }) {
            PaywallView(from: "onboarding")
        }
        .onAppear {
            AnalyticsService.track(.onboardingStarted)
            applyDebugJump()
            syncAtmosphere()
        }
        .onChange(of: stepIndex) { _, _ in syncAtmosphere() }
        .onChange(of: phase) { _, _ in syncAtmosphere() }
    }

    /// Debug (screenshots): SIMCTL_CHILD_HALE_QUIZ_STEP=0…6 jumps to a quiz step,
    /// SIMCTL_CHILD_HALE_QUIZ_PHASE=building|reveal|commit|push|invite jumps to a
    /// beat — both with sample answers prefilled. DEBUG builds only.
    private func applyDebugJump() {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        guard env["HALE_QUIZ_STEP"] != nil || env["HALE_QUIZ_PHASE"] != nil else { return }
        productType = "vape"; perDay = 1; unitCost = 25
        triggers = ["Stress", "After meals"]; hardestHour = 21; motivation = "health"; name = "Alex"
        if let s = env["HALE_QUIZ_STEP"].flatMap(Int.init), (0...6).contains(s) { stepIndex = s }
        let jump: Phase?
        switch env["HALE_QUIZ_PHASE"] {
        case "building": jump = .building
        case "reveal":   jump = .reveal
        case "commit":   jump = .commit
        case "push":     jump = .push
        case "invite":   jump = .invite
        default:         jump = nil
        }
        if let jump {
            // Animate like the real flow so scene transitions run to completion.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                withAnimation(.easeInOut(duration: 0.5)) { phase = jump }
            }
        }
        #endif
    }

    /// Drive the shared backdrop: each answered step burns off more haze.
    private func syncAtmosphere() {
        switch phase {
        case .questions: atmosphere = .journey(Double(stepIndex) / 6.0)
        case .building:  atmosphere = .building
        case .reveal:    atmosphere = .reveal
        case .commit:    atmosphere = .commit
        case .push:      atmosphere = .pushCue
        case .invite:    atmosphere = .invite
        }
        parallax = CGFloat(stepIndex) * 34
    }

    private func advance() {
        Haptics.select()
        withAnimation(.easeInOut(duration: 0.4)) {
            if stepIndex == 6 { phase = .building } else { stepIndex += 1 }
        }
    }

    private func bump() { answerPulse += 1 }

    // MARK: questions
    private var canAdvance: Bool {
        switch stepIndex {
        case 0: return productType != nil
        case 1: return (perDay ?? 0) > 0
        case 2: return (unitCost ?? 0) > 0
        case 3: return !triggers.isEmpty
        case 4: return hardestHour != nil
        case 5: return !motivation.isEmpty
        default: return true
        }
    }

    private var questions: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                IconBtn(systemName: "chevron.left") {
                    if stepIndex == 0 {
                        if let onExit { onExit() } else { dismiss() }
                    } else {
                        withAnimation(.easeInOut(duration: 0.35)) { stepIndex -= 1 }
                    }
                }
                Steps(total: 7, current: stepIndex)
                Spacer()
            }
            .padding(.horizontal, Tok.gutter).padding(.top, 4)

            // The scene: identity per step so page-turn transitions fire.
            ZStack {
                stepScene
                    .id(stepIndex)
                    .transition(.storyStep)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            StoryDock {
                HButton(label: stepIndex == 6 ? "Build my plan" : "Continue", variant: .primary, disabled: !canAdvance) {
                    advance()
                }
            }
        }
    }

    private var stepScene: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Spacer()
                    HeroOrb(clarity: 0.1 + 0.75 * Double(stepIndex) / 6.0,
                            pulse: answerPulse, diameter: 84)
                    Spacer()
                }
                .padding(.top, 2)
                Txt.Eyebrow("Sage · \(stepIndex + 1) of 7", color: Tok.accent).riseIn(0)
                Txt.H1(stepTitle).riseIn(1)
                if let sub = stepSubtitle { NarratorText(line: sub, delay: 0.3) }
                stepBody.padding(.top, 4).riseIn(2, delay: 0.15)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tok.gutter).padding(.top, 8).padding(.bottom, 24)
        }
    }

    private var stepTitle: String {
        switch stepIndex {
        case 0: return "What are you\nquitting?"
        case 1: return product.q2Title
        case 2: return product.q3Title
        case 3: return "When do cravings\nhit hardest?"
        case 4: return "What's your\ntoughest time?"
        case 5: return "What's pulling\nyou forward?"
        default: return "What should we\ncall you?"
        }
    }
    private var stepSubtitle: String? {
        switch stepIndex {
        case 0: return "We tailor your plan to what you use."
        case 1: return "Ballpark is fine. We use it to size your savings."
        case 2: return "Roughly is fine."
        case 3: return "Pick all that hit. Your plan works around them."
        case 4: return "We'll check in with you right before it."
        case 5: return "Your reason shows up when cravings do."
        default: return "Just a first name, so your plan feels like yours. Optional."
        }
    }

    @ViewBuilder private var stepBody: some View {
        switch stepIndex {
        case 0:
            VStack(spacing: 12) {
                ForEach(products, id: \.value) { p in
                    OptRow(label: p.label, on: productType == p.value, icon: p.icon) {
                        productType = p.value; perDay = nil; unitCost = nil; perDayText = ""; unitCostText = ""
                        bump()
                    }
                }
            }
        case 1:
            if product.q2Options.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Txt.Eyebrow(product.q2Eyebrow)
                    UnderlineInput(text: Binding(get: { perDayText }, set: { perDayText = $0.filter { "0123456789".contains($0) }; perDay = Double(perDayText); bump() }),
                                   filled: (perDay ?? 0) > 0, suffix: product.q2Suffix)
                }
            } else {
                VStack(spacing: 12) {
                    ForEach(product.q2Options, id: \.0) { opt in
                        OptRow(label: opt.0, sub: opt.1.isEmpty ? nil : opt.1, on: perDay == opt.2) { perDay = opt.2; bump() }
                    }
                }
            }
        case 2:
            VStack(alignment: .leading, spacing: 10) {
                Txt.Eyebrow(product.q3Eyebrow)
                UnderlineInput(text: Binding(get: { unitCostText }, set: { unitCostText = $0.filter { "0123456789.".contains($0) }; unitCost = Double(unitCostText); bump() }),
                               filled: (unitCost ?? 0) > 0, prefix: "$", placeholder: "0.00")
            }
        case 3:
            let cols = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
            let allTriggers = triggerChoices + triggers.filter { !triggerChoices.contains($0) }
            VStack(spacing: 10) {
                LazyVGrid(columns: cols, spacing: 10) {
                    ForEach(allTriggers, id: \.self) { t in
                        checkTile(t, on: triggers.contains(t)) {
                            if let i = triggers.firstIndex(of: t) { triggers.remove(at: i) } else { triggers.append(t) }
                            Haptics.select(); bump()
                        }
                    }
                }
                Input(text: $customTrigger, placeholder: "Add your own, then return")
                    .onSubmit {
                        let t = customTrigger.trimmingCharacters(in: .whitespaces)
                        if !t.isEmpty && !triggers.contains(t) { triggers.append(t); Haptics.select(); bump() }
                        customTrigger = ""
                    }
            }
        case 4:
            VStack(spacing: 12) {
                ForEach(hourBands, id: \.0) { band in
                    OptRow(label: band.1, on: customHour.isEmpty && hardestHour == band.0) { hardestHour = band.0; customHour = ""; bump() }
                }
                Input(text: $customHour, placeholder: "Or enter a time, e.g. 9am, 14:00")
                    .onChange(of: customHour) { _, v in if let h = parseHour(v) { hardestHour = h; bump() } }
            }
        case 5:
            VStack(spacing: 12) {
                ForEach(motivations, id: \.0) { m in
                    OptRow(label: m.1, on: customMotivation.isEmpty && motivation == m.0, icon: m.2) { motivation = m.0; customMotivation = ""; bump() }
                }
                Input(text: $customMotivation, placeholder: "Or write your own reason")
                    .onChange(of: customMotivation) { _, v in if !v.isEmpty { motivation = v } }
            }
        default:
            Input(text: $name, placeholder: "First name")
        }
    }

    private func checkTile(_ label: String, on: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            HStack {
                Text(label).font(.sora(.medium, 15)).foregroundStyle(Tok.fg)
                Spacer()
                if on { Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Tok.accentInk).frame(width: 22, height: 22).background(Tok.accent).clipShape(RoundedRectangle(cornerRadius: 7)) }
            }
            .padding(.horizontal, 16).frame(height: 62)
            .background(on ? Tok.accentSoft : Tok.surface2)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(on ? Tok.accentEdge : Tok.stroke, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.97))
    }

    // MARK: derived savings
    private var normalizedProfile: QuitProfile {
        let entered = unitCost ?? 0
        let pd = perDay ?? 0
        let uc = product.costDivisor == 0 ? (pd > 0 ? entered / pd : 0) : entered / product.costDivisor
        return QuitProfile(productType: ProductType(rawValue: product.value) ?? .mixed, baselinePerDay: pd, unitCost: uc)
    }
    private var annual: Int { Int(Plan.projectedAnnualSavings(normalizedProfile).rounded()) }
    private var monthly: Int { Int((Double(annual) / 12).rounded()) }
    private var firstMonth: Int { Int(Plan.moneySaved(baselinePerDay: normalizedProfile.baselinePerDay, unitCost: normalizedProfile.unitCost, ms: 30 * 86_400_000).rounded()) }

    // MARK: building — the suspense beat
    private var building: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            HStack { Spacer(); HeroOrb(clarity: 0.6, pulse: answerPulse, energy: 2.1, diameter: 128); Spacer() }
            Txt.H1(name.isEmpty ? "Hang tight" : "Hang tight, \(name)")
                .frame(maxWidth: .infinity, alignment: .center)
                .multilineTextAlignment(.center)
                .riseIn(0)
            NarratorText(line: "I'm shaping your plan around what you told me.", delay: 0.2, color: Tok.fg2)
                .frame(maxWidth: .infinity, alignment: .center)
            BuildChecklist(lines: [
                "Reading your triggers",
                "Sizing what you'll save",
                "Mapping your first 72 hours",
                "Placing support at your toughest hour",
            ]) {
                Haptics.success()
                AnalyticsService.track(.planViewed)
                withAnimation(.easeInOut(duration: 0.6)) { phase = .reveal }
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, alignment: .center)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, Tok.gutter)
        .frame(maxWidth: .infinity)
    }

    // MARK: reveal — the payoff
    private var reveal: some View {
        VStack(spacing: 0) {
            ZStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Txt.Eyebrow("Sage", color: Tok.accent).riseIn(0)
                        Txt.H1(name.isEmpty ? "Here's what\nquitting gives back" : "\(name), here's what\nquitting gives back").riseIn(1)
                        CardHero(pad: true) {
                            VStack(alignment: .leading, spacing: 12) {
                                Txt.Eyebrow("Projected savings this year", color: Tok.accent)
                                CountUpDisplay(target: annual, size: 56, onLand: {
                                    Haptics.celebrate()
                                    revealBurst += 1
                                    revealShine += 1
                                })
                                HStack(spacing: 12) {
                                    Tile(k: "First month", v: "$\(Money.grouped(firstMonth))")
                                    Tile(k: "Every month", v: "$\(Money.grouped(monthly))")
                                }
                            }
                        }
                        .changeEffect(.shine(duration: 1.1), value: revealShine)
                        .riseIn(2, delay: 0.1)

                        Txt.H3("Your body heals fast").riseIn(0, delay: 1.6)
                        ForEach(Array(Plan.healthMilestones.prefix(5).enumerated()), id: \.offset) { i, m in
                            HStack(alignment: .top, spacing: 12) {
                                Text("\(i + 1)").font(.sora(.bold, 14)).foregroundStyle(Tok.accent).frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Txt.Eyebrow(formatHours(m.hours))
                                    Txt.Body(m.label, color: Tok.fg)
                                }
                            }
                            .riseIn(0, delay: 1.8 + Double(i) * 0.16)
                        }
                        Txt.Muted("Recovery timelines reflect commonly reported milestones and are general guidance, not medical advice. Everyone's body is different.")
                            .riseIn(0, delay: 2.7)
                    }
                    .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
                }
                if revealBurst > 0 {
                    RevealBurst().id(revealBurst).ignoresSafeArea()
                }
            }
            StoryDock {
                HButton(label: "Continue", variant: .primary) {
                    Haptics.press()
                    withAnimation(.easeInOut(duration: 0.45)) { phase = .commit }
                }
            }
        }
    }

    private func formatHours(_ h: Double) -> String {
        if h < 1 { return "\(Int(h * 60)) min" }
        if h < 24 { return "\(Int(h)) hr" }
        if h < 168 { return "\(Int(h / 24)) day\(Int(h / 24) == 1 ? "" : "s")" }
        if h < 720 { return "\(Int(h / 168)) week\(Int(h / 168) == 1 ? "" : "s")" }
        if h < 8760 { return "\(Int(h / 720)) month\(Int(h / 720) == 1 ? "" : "s")" }
        return "1 year"
    }

    private func parseHour(_ s: String) -> Int? {
        let str = s.lowercased().trimmingCharacters(in: .whitespaces)
        guard !str.isEmpty else { return nil }
        let pm = str.contains("pm"), am = str.contains("am")
        let digits = str.replacingOccurrences(of: "am", with: "").replacingOccurrences(of: "pm", with: "")
        let head = digits.split(separator: ":").first.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? ""
        guard var h = Int(head) else { return nil }
        if pm && h < 12 { h += 12 }
        if am && h == 12 { h = 0 }
        return (0...23).contains(h) ? h : nil
    }

    // MARK: commit — quiet, then the heaviest beat in the story
    private var commitScreen: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Txt.H1(name.isEmpty ? "Ready to\nstart?" : "Ready,\n\(name)?").riseIn(0)
                    NarratorText(line: "Your quit clock starts the moment you commit. From here you'll see your clean time, your money saved — and you won't do it alone.", delay: 0.3)
                    CardHero(pad: true) {
                        VStack(alignment: .leading, spacing: 6) {
                            Txt.Eyebrow("On track to save", color: Tok.accent)
                            Txt.Display("$\(Money.grouped(annual))", size: 56, color: Tok.accent)
                            Txt.Eyebrow("this year")
                        }
                    }
                    .riseIn(1, delay: 0.2)
                }
                .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
            }
            StoryDock {
                HButton(label: "I'm committing. Start my quit", variant: .primary, loading: submitting) { commit() }
                    .changeEffect(.shine(duration: 1.4), value: commitShine)
                Txt.Muted("No account needed · progress stays on this device")
            }
        }
        .onAppear { Haptics.breath(.inhale) }
        .onReceive(sheenTimer) { _ in if phase == .commit { commitShine += 1 } }
    }

    private func commit() {
        guard !submitting else { return }
        submitting = true
        Task {
            guard await app.signInAnonymously() else {
                submitting = false
                Toast.error("Couldn't start your plan. Check your connection and try again.")
                return
            }
            let uid = await app.completeOnboarding(
                timezone: TimeZone.current.identifier, productType: product.value,
                baselinePerDay: normalizedProfile.baselinePerDay, unitCost: normalizedProfile.unitCost,
                triggers: triggers, hardestHour: Double(hardestHour ?? 9),
                motivation: motivation.isEmpty ? nil : motivation, name: name.isEmpty ? nil : name)
            if let uid { await PurchasesService.logIn(convexUserId: uid) }   // identifyPurchaser
            AnalyticsService.track(.quitCommitted, [
                "product_type": product.value,
                "baseline_per_day": normalizedProfile.baselinePerDay,
                "projected_annual": annual])
            Haptics.heavy()
            // Pending-buddy redemption (deferred attribution): install + pair.
            if let referrer = Prefs.pendingBuddyId {
                var durable = false
                if await app.attributeInstall(referrerId: referrer)?.attributed == true {
                    durable = true
                    AnalyticsService.track(.referralInstallAttributed, ["referrer_id": referrer])
                }
                if let pair = try? await app.pairWith(inviterId: referrer, method: "invite_onboard") {
                    durable = true
                    AnalyticsService.track(.buddyPaired, ["via": "invite_onboard", "pairing_method": "invite_onboard"])
                    redeemReferral(pair)
                }
                // Re-stash if nothing durable landed so a later retry can still redeem it.
                Prefs.pendingBuddyId = durable ? nil : referrer
            }
            submitting = false
            showPaywall = true
        }
    }

    // Fire the referrer-side funnel events from a pairWith/requestMatch result.
    private func redeemReferral(referrerId: String?, completed: Bool, rewardGranted: Bool) {
        guard let rid = referrerId else { return }
        AnalyticsService.track(.referralBuddyPaired, ["referrer_id": rid])
        if completed { AnalyticsService.track(.referralCompleted, ["referrer_id": rid]) }
        if rewardGranted { AnalyticsService.track(.rewardGranted, ["referrer_id": rid, "reward_days": 7]) }
    }
    private func redeemReferral(_ pair: PairResult) {
        redeemReferral(referrerId: pair.referrerId, completed: pair.referralCompleted, rewardGranted: pair.rewardGranted)
    }

    // MARK: push
    private var pushStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Image(systemName: "bell.fill").font(.system(size: 28)).foregroundStyle(Tok.accent)
                .frame(width: 64, height: 64).background(Tok.accentSoft).clipShape(RoundedRectangle(cornerRadius: 18))
                .symbolEffect(.pulse)
                .riseIn(0)
            Txt.H1("Want a nudge\nwhen it's hardest?").riseIn(1)
            NarratorText(line: "The people who quit for good get a little support right before their toughest hour — a check-in, a craving tip. No spam, ever.", delay: 0.3)
            Spacer()
            HButton(label: "Yes, support me through it", variant: .primary) { PushService.requestPermission(); afterPush() }
            HButton(label: "Maybe later", variant: .ghost) { afterPush() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter).padding(.bottom, 30)
    }
    private func afterPush() {
        Haptics.breath(.exhale)
        withAnimation(.easeInOut(duration: 0.5)) { phase = .invite }
    }

    // MARK: invite
    private var inviteStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Image(systemName: "person.2.fill").font(.system(size: 28)).foregroundStyle(Tok.warm)
                .frame(width: 64, height: 64).background(Tok.warmSoft).clipShape(RoundedRectangle(cornerRadius: 18))
                .riseIn(0)
            Txt.H1("Quit with\na buddy").riseIn(1)
            NarratorText(line: "People with a buddy are far likelier to stay quit. They only ever see your streak — never your slip-ups.", delay: 0.3)
            Spacer()
            HButton(label: "Find me a buddy", variant: .primary) { Task { await findBuddy() } }
            HButton(label: "I'll start on my own", variant: .ghost) {
                AnalyticsService.track(.soloBridgeTaken, ["reason": "user_chose_solo"])
                app.finishOnboarding()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter).padding(.bottom, 30)
        .onAppear { AnalyticsService.track(.inviteOffered, ["invite_source": "onboarding", "is_default_path": true]) }
    }

    private func findBuddy() async {
        AnalyticsService.track(.matchmakingRequested, ["invite_source": "onboarding"])
        let res = await app.requestMatch()
        if let res, res.matched {
            AnalyticsService.track(.matchmakingMatched, ["pairing_method": "matchmaking", "pool_size": res.poolSize ?? 0])
            AnalyticsService.track(.buddyPaired, ["via": "matchmaking", "pairing_method": "matchmaking"])
            redeemReferral(referrerId: res.referrerId, completed: res.referralCompleted ?? false, rewardGranted: res.rewardGranted ?? false)
        } else {
            AnalyticsService.track(.matchmakingNoMatch, ["pool_size": res?.poolSize ?? 0])
        }
        app.finishOnboarding()
    }
}
