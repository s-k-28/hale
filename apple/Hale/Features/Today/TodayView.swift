import SwiftUI

// Home dashboard — live clean-time counter ring, next-milestone strip, money/recovery
// tiles, one-tap check-in, SOS card. (Buddy row + milestone celebration land in 4a follow-up.)
struct TodayView: View {
    @Environment(AppState.self) private var app
    @State private var ringSurge = 0
    @State private var checking = false
    @State private var showSOS = false
    @State private var buddy = LiveQuery<MyBuddy?>(Fn.myBuddy)
    @State private var celebrateDay: Int?

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

    @ViewBuilder
    private func buddyRow(_ b: MyBuddy) -> some View {
        Card(pad: true) {
            HStack(spacing: 12) {
                Circle().fill(Tok.warmSoft).frame(width: 40, height: 40)
                    .overlay(Text(String((b.buddy.name ?? "★").prefix(1))).font(.sora(.bold, 16)).foregroundStyle(Tok.warm))
                VStack(alignment: .leading, spacing: 2) {
                    Text(b.buddy.name ?? "Your buddy").font(.sora(.semibold, 15)).foregroundStyle(Tok.fg)
                    Text(b.buddy.currentStreak > 0 ? "\(b.buddy.currentStreak)-day streak · cheer them on" : "Tap to check in on each other")
                        .font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                }
                Spacer()
            }
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

        return ZStack {
            Tok.bg.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Txt.Eyebrow("Nicotine-free")
                            Txt.H1("Today")
                        }
                        Spacer()
                        if today.hasHALEPlus { Badge(label: "HALE+", tone: .soft) }
                    }

                    HStack {
                        Spacer()
                        Ring(progress: milestoneProgress, size: 272, stroke: 10, surge: ringSurge) {
                            VStack(spacing: 2) {
                                Txt.Eyebrow("Clean for")
                                Txt.Display("\(days)", size: 66)
                                Txt.Eyebrow(days == 1 ? "Day" : "Days", color: Tok.accent)
                                HStack(spacing: 10) {
                                    counter(hours, "H"); counter(mins, "M"); counter(secs, "S")
                                }.padding(.top, 6)
                            }
                        }
                        .overlay { if ringSurge > 0 { RingBurst().id(ringSurge).frame(width: 272, height: 272) } }
                        Spacer()
                    }

                    milestoneStrip(next: next, progress: milestoneProgress, cleanMs: cleanMs).riseIn(0)

                    HStack(spacing: 12) {
                        Tile(k: "Money saved", v: money(today.currentMoneySaved))
                        Tile(k: "Typical recovery", v: recoveryPct == 0 ? "Day 1" : "\(recoveryPct)%", accent: true)
                    }.riseIn(1)

                    HButton(label: alreadyToday ? "Checked in, clean today" : "Check in, clean today",
                            variant: .primary, loading: checking, disabled: alreadyToday) {
                        Task {
                            checking = true
                            if await app.checkIn() { ringSurge += 1; Haptics.success() }
                            checking = false
                        }
                    }

                    sosCard.riseIn(2)
                    if let b = buddy.value ?? nil { buddyRow(b).riseIn(3) }
                }
                .padding(.horizontal, Tok.gutter)
                .padding(.top, 8)
                .padding(.bottom, 40)
                .onChange(of: days) { _, d in checkLandmark(d) }
                .onAppear { checkLandmark(days) }
            }
        }
    }

    private func counter(_ v: Int, _ unit: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(String(format: "%02d", v)).font(.sora(.bold, 16)).monospacedDigit().foregroundStyle(Tok.fg)
            Text(unit).font(.sora(.semibold, 11)).foregroundStyle(Tok.fg3)
        }
    }

    @ViewBuilder
    private func milestoneStrip(next: Plan.HealthMilestone?, progress: Double, cleanMs: Double) -> some View {
        Card(pad: true) {
            VStack(alignment: .leading, spacing: 10) {
                Txt.Eyebrow(next == nil ? "Fully recovered" : "Next milestone", color: Tok.accent)
                if let n = next {
                    Txt.H3(countdown(hoursTarget: n.hours, cleanMs: cleanMs))
                    Txt.Body(n.label)
                    Track(progress: progress, tone: .accent)
                } else {
                    Txt.Body("Every milestone reached. Your body has come a long way.")
                }
            }
        }
    }

    private var sosCard: some View {
        Button { Haptics.heavy(); showSOS = true } label: {
            HStack(spacing: 14) {
                Image(systemName: "cross.case.fill").font(.system(size: 20)).foregroundStyle(Tok.coral)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Craving SOS").font(.sora(.semibold, 16)).foregroundStyle(Tok.fg)
                    Text("Tap for help — it passes in minutes").font(.sora(.regular, 13)).foregroundStyle(Tok.fg2)
                }
                Spacer()
            }
            .padding(18)
            .frame(maxWidth: .infinity)
            .background(Tok.coralSoft)
            .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(Tok.coralEdge, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle(scale: 0.98))
    }

    private func money(_ v: Double) -> String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.maximumFractionDigits = v < 100 ? 2 : 0
        return f.string(from: NSNumber(value: v)) ?? "$0"
    }
    private func countdown(hoursTarget: Double, cleanMs: Double) -> String {
        let remainingH = hoursTarget - cleanMs / 3_600_000
        if remainingH <= 0 { return "now" }
        if remainingH < 1 { return "\(Int(remainingH * 60))m" }
        if remainingH < 24 { return "\(Int(remainingH))h" }
        return "\(Int(remainingH / 24))d"
    }
}
