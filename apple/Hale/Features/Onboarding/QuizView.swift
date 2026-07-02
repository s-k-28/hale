import SwiftUI

// The onboarding quiz — phase machine (questions → building → reveal → commit →
// push → invite). Answers live in local state until commit (deferred sign-up).
// Savings/milestones use the ported Plan model. Mirrors (onboarding)/quiz.tsx.
struct QuizView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

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
    @State private var buildStep = 0
    @State private var customTrigger = ""
    @State private var customHour = ""
    @State private var customMotivation = ""

    private var product: Product { products.first { $0.value == productType } ?? products[0] }

    var body: some View {
        Group {
            switch phase {
            case .questions: questions
            case .building:  building
            case .reveal:    reveal
            case .commit:    commitScreen
            case .push:      pushStep
            case .invite:    inviteStep
            }
        }
        .navigationBarBackButtonHidden(true)
        .onAppear { AnalyticsService.track(.onboardingStarted) }
    }

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
                IconBtn(systemName: "chevron.left") { if stepIndex == 0 { dismiss() } else { stepIndex -= 1 } }
                Steps(total: 7, current: stepIndex)
                Spacer()
            }
            .padding(.horizontal, Tok.gutter).padding(.top, 4)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Txt.Eyebrow("Sage · \(stepIndex + 1)/7", color: Tok.accent)
                    Txt.H1(stepTitle)
                    if let sub = stepSubtitle { Txt.Body(sub) }
                    stepBody.padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Tok.gutter).padding(.top, 12).padding(.bottom, 24)
            }

            CtaDock {
                HButton(label: stepIndex == 6 ? "Build my plan" : "Continue", variant: .primary, disabled: !canAdvance) {
                    Haptics.select()
                    if stepIndex == 6 { phase = .building } else { stepIndex += 1 }
                }
            }
        }
        .background(Tok.bg.ignoresSafeArea())
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
                    }
                }
            }
        case 1:
            if product.q2Options.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Txt.Eyebrow(product.q2Eyebrow)
                    UnderlineInput(text: Binding(get: { perDayText }, set: { perDayText = $0.filter { "0123456789".contains($0) }; perDay = Double(perDayText) }),
                                   filled: (perDay ?? 0) > 0, suffix: product.q2Suffix)
                }
            } else {
                VStack(spacing: 12) {
                    ForEach(product.q2Options, id: \.0) { opt in
                        OptRow(label: opt.0, sub: opt.1.isEmpty ? nil : opt.1, on: perDay == opt.2) { perDay = opt.2 }
                    }
                }
            }
        case 2:
            VStack(alignment: .leading, spacing: 10) {
                Txt.Eyebrow(product.q3Eyebrow)
                UnderlineInput(text: Binding(get: { unitCostText }, set: { unitCostText = $0.filter { "0123456789.".contains($0) }; unitCost = Double(unitCostText) }),
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
                            Haptics.select()
                        }
                    }
                }
                Input(text: $customTrigger, placeholder: "Add your own, then return")
                    .onSubmit {
                        let t = customTrigger.trimmingCharacters(in: .whitespaces)
                        if !t.isEmpty && !triggers.contains(t) { triggers.append(t); Haptics.select() }
                        customTrigger = ""
                    }
            }
        case 4:
            VStack(spacing: 12) {
                ForEach(hourBands, id: \.0) { band in
                    OptRow(label: band.1, on: customHour.isEmpty && hardestHour == band.0) { hardestHour = band.0; customHour = "" }
                }
                Input(text: $customHour, placeholder: "Or enter a time, e.g. 9am, 14:00")
                    .onChange(of: customHour) { _, v in if let h = parseHour(v) { hardestHour = h } }
            }
        case 5:
            VStack(spacing: 12) {
                ForEach(motivations, id: \.0) { m in
                    OptRow(label: m.1, on: customMotivation.isEmpty && motivation == m.0, icon: m.2) { motivation = m.0; customMotivation = "" }
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

    // MARK: building
    private var building: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView().tint(Tok.accent)
            Txt.H1(name.isEmpty ? "Hang tight" : "Hang tight, \(name)")
            Txt.Lead("Building your personalized quit plan")
            Spacer()
        }
        .frame(maxWidth: .infinity).background(Tok.bg.ignoresSafeArea())
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
                Haptics.success(); AnalyticsService.track(.planViewed); phase = .reveal
            }
        }
    }

    // MARK: reveal
    private var reveal: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Txt.H1(name.isEmpty ? "Here's what\nquitting gives back" : "\(name), here's what\nquitting gives back")
                    CardHero(pad: true) {
                        VStack(alignment: .leading, spacing: 12) {
                            Txt.Eyebrow("Projected savings this year", color: Tok.accent)
                            Txt.Display("$\(annual)", size: 56, color: Tok.accent)
                            HStack(spacing: 12) {
                                Tile(k: "First month", v: "$\(firstMonth)")
                                Tile(k: "Every month", v: "$\(monthly)")
                            }
                        }
                    }
                    Txt.H3("Your body heals fast")
                    ForEach(Array(Plan.healthMilestones.prefix(5).enumerated()), id: \.offset) { i, m in
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(i + 1)").font(.sora(.bold, 14)).foregroundStyle(Tok.accent).frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Txt.Eyebrow(formatHours(m.hours))
                                Txt.Body(m.label, color: Tok.fg)
                            }
                        }.riseIn(i)
                    }
                    Txt.Muted("Commonly reported timeline — supportive, not medical advice.")
                }
                .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
            }
            CtaDock { HButton(label: "Continue", variant: .primary) { phase = .commit } }
        }
        .background(Tok.bg.ignoresSafeArea())
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

    // MARK: commit
    private var commitScreen: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Txt.H1(name.isEmpty ? "Ready to\nstart?" : "Ready,\n\(name)?")
                    Txt.Lead("Your quit clock starts the moment you commit. From here you'll see your clean time, your money saved — and you won't do it alone.")
                    CardHero(pad: true) {
                        VStack(alignment: .leading, spacing: 6) {
                            Txt.Eyebrow("On track to save", color: Tok.accent)
                            Txt.Display("$\(annual)", size: 56, color: Tok.accent)
                            Txt.Eyebrow("this year")
                        }
                    }
                }
                .padding(.horizontal, Tok.gutter).padding(.vertical, 20)
            }
            CtaDock {
                VStack(spacing: 8) {
                    HButton(label: "I'm committing. Start my quit", variant: .primary, loading: submitting) { commit() }
                    Txt.Muted("No account needed · progress stays on this device")
                }
            }
        }
        .background(Tok.bg.ignoresSafeArea())
    }

    private func commit() {
        guard !submitting else { return }
        submitting = true
        Task {
            guard await app.signInAnonymously() else { submitting = false; return }
            let uid = await app.completeOnboarding(
                timezone: TimeZone.current.identifier, productType: product.value,
                baselinePerDay: normalizedProfile.baselinePerDay, unitCost: normalizedProfile.unitCost,
                triggers: triggers, hardestHour: Double(hardestHour ?? 9),
                motivation: motivation.isEmpty ? nil : motivation, name: name.isEmpty ? nil : name)
            AnalyticsService.track(.quitCommitted, ["product_type": product.value, "projected_annual": annual])
            Haptics.heavy()
            // Pending-buddy redemption (deferred attribution): install + pair.
            if let referrer = Prefs.pendingBuddyId {
                Prefs.pendingBuddyId = nil
                await app.attributeInstall(referrerId: referrer)
                await app.pairWith(inviterId: referrer, method: "invite_onboard")
                AnalyticsService.track(.buddyPaired, ["via": "invite_onboard"])
            }
            _ = uid
            phase = .push
        }
    }

    // MARK: push
    private var pushStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Image(systemName: "bell.fill").font(.system(size: 28)).foregroundStyle(Tok.accent)
                .frame(width: 64, height: 64).background(Tok.accentSoft).clipShape(RoundedRectangle(cornerRadius: 18))
            Txt.H1("Want a nudge\nwhen it's hardest?")
            Txt.Lead("The people who quit for good get a little support right before their toughest hour — a check-in, a craving tip. No spam, ever.")
            Spacer()
            HButton(label: "Yes, support me through it", variant: .primary) { PushService.requestPermission(); afterPush() }
            HButton(label: "Maybe later", variant: .ghost) { afterPush() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter).padding(.bottom, 30)
        .background(Tok.bg.ignoresSafeArea())
    }
    private func afterPush() { phase = .invite }

    // MARK: invite
    private var inviteStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Image(systemName: "person.2.fill").font(.system(size: 28)).foregroundStyle(Tok.warm)
                .frame(width: 64, height: 64).background(Tok.warmSoft).clipShape(RoundedRectangle(cornerRadius: 18))
            Txt.H1("Quit with\na buddy")
            Txt.Lead("People with a buddy are far likelier to stay quit. They only ever see your streak — never your slip-ups.")
            Spacer()
            HButton(label: "Find me a buddy", variant: .primary) { Task { await app.requestMatch(); app.finishOnboarding() } }
            HButton(label: "I'll start on my own", variant: .ghost) { app.finishOnboarding() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tok.gutter).padding(.bottom, 30)
        .background(Tok.bg.ignoresSafeArea())
        .onAppear { AnalyticsService.track(.buddyPaired, ["invite_source": "onboarding"]) }
    }
}
