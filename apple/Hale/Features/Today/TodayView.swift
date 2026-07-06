import SwiftUI
import Pow

// Home — the clean-time RING is the single hero. Everything else (next milestone,
// money / recovery, SOS, buddy) is demoted into a calm, well-spaced stack below.
// The check-in is the one primary action on the screen.
struct TodayView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var ringSurge = 0
    @State private var checking = false
    // Synchronized reveal: on appear the ring arc sweeps 0→progress (~900ms, slight
    // overshoot) while clean-time and money count up from 0 IN SYNC, landing together.
    @State private var revealed = false
    @State private var showSOS = false
    @State private var buddy = LiveQuery<MyBuddy?>(Fn.myBuddy)
    @State private var nudges = LiveQuery<[Nudge]>(Fn.myNudges)
    @State private var celebrateDay: Int?
    @State private var firedCounterViewed = false
    // Live money-saved: money accrues linearly from quitStart, so the per-ms rate is
    // (savedSnapshot / elapsed-at-snapshot). Frozen once per server value, then the
    // display climbs off the live clock so "money saved" ticks up instead of sitting dead.
    @State private var moneyBase = 0.0
    @State private var moneyBaseMs = 0.0
    @State private var moneyRatePerMs = 0.0

    var body: some View {
        Group {
            if let today = app.today {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    content(today, nowMs: ctx.date.timeIntervalSince1970 * 1000)
                }
            } else {
                LoadingView()
            }
        }
        .fullScreenCover(isPresented: $showSOS) { SOSView() }
        .overlay {
            if let d = celebrateDay {
                MilestoneCelebration(day: d) { Prefs.lastCelebratedLandmark = d; celebrateDay = nil }
            }
        }
    }

    private func checkLandmark(_ days: Int) {
        let reached = Plan.landmarkDays.filter { $0 <= days }.max() ?? 0
        if reached > Prefs.lastCelebratedLandmark { celebrateDay = reached }
    }

    // One-tap check-in → activation funnel events + error toast (today.tsx:200-222).
    private func runCheckIn() async {
        checking = true
        defer { checking = false }
        guard let r = await app.checkIn() else {
            Toast.error("Couldn't check in. Check your connection and try again.")
            return
        }
        guard !r.alreadyCheckedIn else { return }
        ringSurge += 1; Haptics.success()
        AnalyticsService.track(.checkinCompleted, ["streak": r.streak, "usedFreeze": r.usedFreeze])
        if r.usedFreeze { AnalyticsService.track(.streakFreezeUsed, ["streak": r.streak]) }
        if r.firstCheckIn == true {
            AnalyticsService.track(.firstCheckIn, ["pairing_method": r.pairingMethod ?? "solo"])
        }
        if r.activatedPairedQuitter == true {
            var p: [String: Any] = ["pairing_method": r.pairingMethod ?? "", "quit_stage": r.quitStage ?? ""]
            if let h = r.hoursPairToCheckin { p["hours_pair_to_checkin"] = h }
            AnalyticsService.track(.activatedPairedQuitter, p)
        }
    }

    private func content(_ today: TodayState, nowMs: Double) -> some View {
        let cleanMs = max(0, nowMs - today.quitStart)
        let totalSec = Int(cleanMs / 1000)
        let days = totalSec / 86400
        let hours = (totalSec % 86400) / 3600
        let mins = (totalSec % 3600) / 60
        let secs = totalSec % 60
        let next = Plan.nextHealthMilestone(quitStart: today.quitStart, now: nowMs)
        let milestoneProgress: Double = {
            guard let n = next else { return 1 }
            let elapsedH = cleanMs / 3_600_000
            return min(1, elapsedH / n.hours)
        }()
        let recoveryPct = Int(Plan.recoveryFraction(quitStart: today.quitStart, now: nowMs) * 100)
        let tz = today.timezone ?? "UTC"
        let alreadyToday = today.lastCheckInLocalDate == Streak.localDateOf(nowMs, timezone: tz)
        let liveMoney = moneyRatePerMs > 0 ? moneyBase + moneyRatePerMs * (nowMs - moneyBaseMs)
                                           : today.currentMoneySaved

        return ZStack {
            // emerald bloom sits under the ring — the screen's one hero glow
            HaleBackdrop(bloom: UnitPoint(x: 0.5, y: 0.34))
            ScrollView {
                VStack(spacing: 0) {
                    topBar(today)

                    if let n = (nudges.value ?? []).first {
                        nudgeInbox(n).padding(.top, 16)
                    }

                    // ── HERO: the ring, given room to breathe ──────────────────
                    heroRing(days: days, hours: hours, mins: mins, secs: secs,
                             progress: milestoneProgress)
                        .padding(.top, Tok.sectionLg)

                    milestoneLine(next: next, progress: revealed ? milestoneProgress : 0, cleanMs: cleanMs)
                        .padding(.top, Tok.section)
                        .haleScrollReveal(0)

                    // ── the one primary action ─────────────────────────────────
                    HButton(label: alreadyToday ? "Checked in, clean today" : "Check in, clean today",
                            variant: .primary, loading: checking, disabled: alreadyToday) {
                        Task { await runCheckIn() }
                    }
                    .changeEffect(.glow(color: Tok.accent), value: ringSurge)
                    .padding(.top, Tok.sectionLg)
                    .haleScrollReveal(1)

                    // ── demoted secondary stack ────────────────────────────────
                    quietStats(money: revealed ? liveMoney : 0,
                               recovery: recoveryPct == 0 ? "Day 1" : "\(recoveryPct)%")
                        .padding(.top, Tok.sectionLg)
                        .haleScrollReveal(2)

                    sosRow.padding(.top, Tok.section).haleScrollReveal(3)

                    if !buddy.loaded {
                        buddyPlaceholder.padding(.top, Tok.section)
                    } else if let b = buddy.value ?? nil {
                        buddyRow(b).padding(.top, Tok.section).haleScrollReveal(4)
                    }
                }
                .frame(maxWidth: Tok.maxContent)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, Tok.gutter)
                .padding(.top, Tok.screenTop)
                .padding(.bottom, 40)
                .onChange(of: days) { _, d in checkLandmark(d) }
                .onChange(of: today.currentMoneySaved) { _, _ in captureMoneyRate(today) }
                .onAppear {
                    checkLandmark(days)
                    captureMoneyRate(today)
                    triggerReveal()
                    if !firedCounterViewed { firedCounterViewed = true; AnalyticsService.track(.counterViewed) }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    // Minimal identity — quiet, doesn't compete with the ring.
    private func topBar(_ today: TodayState) -> some View {
        HStack {
            Txt.Eyebrow("Nicotine-free")
            Spacer()
            if today.hasHALEPlus { Badge(label: "HALE+", tone: .soft) }
        }
    }

    private func heroRing(days: Int, hours: Int, mins: Int, secs: Int, progress: Double) -> some View {
        // Everything the hero shows is gated on `revealed` so the arc, the day count,
        // and H/M/S all count up from 0 together on the synchronized reveal.
        Ring(progress: revealed ? progress : 0, size: 256, stroke: 9,
             surge: ringSurge, breathes: true, shimmer: true) {
            VStack(spacing: 2) {
                Txt.Eyebrow("Clean for")
                Txt.Display("\(revealed ? days : 0)", size: 68).digitRoll(revealed ? days : 0)
                Txt.Eyebrow(days == 1 ? "Day" : "Days", color: Tok.accent)
                HStack(spacing: 12) {
                    counter(revealed ? hours : 0, "H")
                    counter(revealed ? mins : 0, "M")
                    counter(revealed ? secs : 0, "S")
                }
                .padding(.top, 8)
            }
        }
        .overlay { if ringSurge > 0 { RingBurst().id(ringSurge).frame(width: 256, height: 256) } }
        .frame(maxWidth: .infinity)
    }

    // Fire the synchronized count-up reveal. Uses the same spring the Ring uses for
    // its arc, so the numbers and the arc land together (~900ms, slight overshoot).
    // Reduce Motion → straight to final values, no count-up.
    private func triggerReveal() {
        guard !revealed else { return }
        if reduceMotion { revealed = true; return }
        withAnimation(.interpolatingSpring(mass: 0.9, stiffness: 120, damping: 14)) { revealed = true }
    }

    private func counter(_ v: Int, _ unit: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(String(format: "%02d", v)).font(.sora(.bold, 15)).monospacedDigit().foregroundStyle(Tok.fg2)
                .digitRoll(v)
            Text(unit).font(.sora(.semibold, 10)).foregroundStyle(Tok.fg3)
        }
    }

    // Next milestone — one calm centered line + a slim track. No card chrome.
    @ViewBuilder
    private func milestoneLine(next: Plan.HealthMilestone?, progress: Double, cleanMs: Double) -> some View {
        VStack(spacing: 10) {
            if let n = next {
                Txt.Eyebrow("Next milestone · \(countdown(hoursTarget: n.hours, cleanMs: cleanMs))", color: Tok.accent)
                Txt.Body(n.label, color: Tok.fg).multilineTextAlignment(.center)
                Track(progress: progress, tone: .accent).frame(maxWidth: 200)
            } else {
                Txt.Eyebrow("Fully recovered", color: Tok.accent)
                Txt.Body("Every milestone reached. Your body has come a long way.")
                    .multilineTextAlignment(.center).frame(maxWidth: 280)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // Money / recovery — demoted to two quiet stats separated by a hairline. No card.
    // Freeze the accrual rate from the current server snapshot (money is linear in
    // clean time). Recomputed whenever the server pushes a new savings value.
    private func captureMoneyRate(_ today: TodayState) {
        let capMs = Date().timeIntervalSince1970 * 1000
        moneyBase = today.currentMoneySaved
        moneyBaseMs = capMs
        moneyRatePerMs = today.currentMoneySaved / max(1, capMs - today.quitStart)
    }

    private func quietStats(money: Double, recovery: String) -> some View {
        HStack(spacing: 0) {
            VStack(spacing: 6) {
                Txt.Eyebrow("Money saved")
                Text(money, format: .currency(code: Locale.current.currency?.identifier ?? "USD")
                        .precision(.fractionLength(2)))
                    .font(.sora(.bold, 22)).tracking(-0.4)
                    .foregroundStyle(Tok.fg)
                    .monospacedDigit()
                    .contentTransition(.numericText(value: money))
                    .animation(.snappy(duration: 0.5), value: money)
            }
            .frame(maxWidth: .infinity)
            Rectangle().fill(Tok.hairline).frame(width: 1, height: 34)
            quietStat("Typical recovery", recovery, accent: true)
        }
    }
    private func quietStat(_ label: String, _ value: String, accent: Bool) -> some View {
        VStack(spacing: 6) {
            Txt.Eyebrow(label)
            Text(value).font(.sora(.bold, 22)).tracking(-0.4)
                .foregroundStyle(accent ? Tok.accent : Tok.fg)
        }
        .frame(maxWidth: .infinity)
    }

    // SOS — kept reachable but demoted from a full card to a calm coral pill.
    private var sosRow: some View {
        Button { Haptics.heavy(); showSOS = true } label: {
            HStack(spacing: 8) {
                Icon(.sos, size: 15, color: Tok.coral)
                Text("Feeling a craving? Craving SOS")
                    .font(.sora(.semibold, 14)).foregroundStyle(Tok.coral)
            }
            .padding(.vertical, 13).padding(.horizontal, 20)
            .background(Capsule().fill(Tok.coralSoft))
            .overlay(Capsule().strokeBorder(Tok.coralEdge, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
        .frame(maxWidth: .infinity)
        .accessibilityLabel("Craving SOS — tap for help")
    }

    private var buddyPlaceholder: some View {
        HStack(spacing: 12) {
            Circle().fill(Tok.surface2).frame(width: 34, height: 34)
            SkeletonList(rows: 1)
        }
    }

    // Buddy — one quiet line (no card): a warm avatar + name + status. Warm lane.
    @ViewBuilder
    private func buddyRow(_ b: MyBuddy) -> some View {
        VStack(spacing: 0) {
            Rectangle().fill(Tok.hairline).frame(height: 1)
            HStack(spacing: 12) {
                Circle().fill(Tok.warmSoft).frame(width: 34, height: 34)
                    .overlay(Text(String((b.buddy.name ?? "★").prefix(1))).font(.sora(.bold, 15)).foregroundStyle(Tok.warm))
                VStack(alignment: .leading, spacing: 2) {
                    Text(b.buddy.name ?? "Your buddy").font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                    Text(b.buddy.currentStreak > 0 ? "\(b.buddy.currentStreak)-day streak · cheer them on" : "Tap to check in on each other")
                        .font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 14)
        }
    }

    // Friend-sourced nudge inbox (S2). Newest nudge; tap → nudge_opened + markRead.
    private func nudgeInbox(_ n: Nudge) -> some View {
        Button {
            Haptics.tap()
            AnalyticsService.track(.nudgeOpened, ["type": n.type])
            Task { await app.markNudgeRead(n.id) }
        } label: {
            HStack(spacing: 10) {
                Icon(.flame, size: 16, color: Tok.warm)
                VStack(alignment: .leading, spacing: 2) {
                    Text(n.title).font(.sora(.bold, 14)).foregroundStyle(Tok.fg)
                    Text(n.body).font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Tok.warmSoft)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(Tok.warmEdge, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
        .accessibilityLabel("Open buddy nudge: \(n.title)")
    }

    private func countdown(hoursTarget: Double, cleanMs: Double) -> String {
        let remainingH = hoursTarget - cleanMs / 3_600_000
        if remainingH <= 0 { return "now" }
        if remainingH < 1 { return "\(Int(remainingH * 60))m" }
        if remainingH < 24 { return "\(Int(remainingH))h" }
        return "\(Int(remainingH / 24))d"
    }
}
// NOTE: `.haleScrollReveal` is the shared modifier provided by
// DesignSystem/ScrollFX.swift (authored by the concurrent Tab-1 session). Today
// adopts it directly per spec — no local copy.
