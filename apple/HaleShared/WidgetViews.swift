import WidgetKit
import SwiftUI

// The widget's SwiftUI views live here (in the shared module) so both the widget
// extension AND a debug gallery inside the app can render them verbatim — the app
// can't import the extension, so sharing the views is the only way to screenshot
// the real surfaces without placing them on a physical Home/Lock screen.

// MARK: - Shared time helpers (clean-time is derived from the fixed quitStart)

func haleCleanDays(_ quitStartMs: Double, now: Double = Date().timeIntervalSince1970 * 1000) -> Int {
    Int(max(0, now - quitStartMs) / HaleShared.msPerDay)
}
func haleDayAnchor(_ quitStartMs: Double, now: Double = Date().timeIntervalSince1970 * 1000) -> Date {
    let ms = quitStartMs + Double(haleCleanDays(quitStartMs, now: now)) * HaleShared.msPerDay
    return Date(timeIntervalSince1970: ms / 1000)
}
// A live-ticking within-day H:M:S timer (00:00:00 → 23:59:59), system-rendered.
func haleLiveTimer(_ quitStartMs: Double, font: Font) -> some View {
    let a = haleDayAnchor(quitStartMs)
    return Text(timerInterval: a...a.addingTimeInterval(86_400), countsDown: false)
        .font(font.monospacedDigit())
        .contentTransition(.numericText())
}
func haleMoney(_ v: Double) -> String {
    let f = NumberFormatter(); f.numberStyle = .currency; f.maximumFractionDigits = v < 100 ? 2 : 0
    return f.string(from: NSNumber(value: v)) ?? "$0"
}

// MARK: - Timeline entry

struct StreakEntry: TimelineEntry {
    let date: Date
    let snapshot: HaleSnapshot

    var days: Int { snapshot.cleanDays(now: date.timeIntervalSince1970 * 1000) }
    var milestoneProgress: Double {
        guard let target = snapshot.nextMilestoneHours, target > 0 else { return 1 }
        let elapsedH = max(0, date.timeIntervalSince1970 * 1000 - snapshot.quitStartMs) / 3_600_000
        return min(1, elapsedH / target)
    }
    var dayAnchor: Date { haleDayAnchor(snapshot.quitStartMs, now: date.timeIntervalSince1970 * 1000) }
}

// MARK: - Home Screen + Lock Screen widget view

struct StreakWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StreakEntry

    var body: some View {
        switch family {
        case .systemSmall:            small
        case .systemMedium:           medium
        case .accessoryCircular:      circular
        case .accessoryRectangular:   rectangular
        case .accessoryInline:        inline
        default:                      small
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Image(systemName: "leaf.fill").font(.system(size: 11, weight: .semibold))
                Text("NICOTINE-FREE").font(Brand.sora("Sora-SemiBold", 9)).tracking(1.2)
            }
            .foregroundStyle(Brand.accent)
            Spacer(minLength: 4)
            Text("\(entry.days)")
                .font(Brand.sora("Sora-Bold", 46)).foregroundStyle(Brand.fg)
                .minimumScaleFactor(0.5).lineLimit(1)
            Text(entry.days == 1 ? "day clean" : "days clean")
                .font(Brand.sora("Sora-Medium", 13)).foregroundStyle(Brand.fg2)
            Spacer(minLength: 6)
            HStack(spacing: 10) {
                metric(icon: "flame.fill", value: "\(entry.snapshot.currentStreak)", tint: Brand.accent)
                metric(icon: "dollarsign.circle.fill", value: haleMoney(entry.snapshot.moneySaved), tint: Brand.warm)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Brand.bg }
    }

    private var medium: some View {
        HStack(spacing: 16) {
            ZStack {
                Color.clear.haleRing(progress: entry.milestoneProgress, line: 8)
                VStack(spacing: 0) {
                    Text("\(entry.days)").font(Brand.sora("Sora-Bold", 34)).foregroundStyle(Brand.fg)
                        .minimumScaleFactor(0.5).lineLimit(1)
                    Text(entry.days == 1 ? "day" : "days").font(Brand.sora("Sora-Medium", 11)).foregroundStyle(Brand.accent)
                }
            }
            .frame(width: 96, height: 96)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) {
                    Image(systemName: "leaf.fill").font(.system(size: 11, weight: .semibold))
                    Text("CLEAN TIME").font(Brand.sora("Sora-SemiBold", 9)).tracking(1.2)
                }.foregroundStyle(Brand.accent)
                if let m = entry.snapshot.nextMilestoneLabel {
                    Text(m).font(Brand.sora("Sora-SemiBold", 14)).foregroundStyle(Brand.fg)
                        .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("Fully recovered").font(Brand.sora("Sora-SemiBold", 14)).foregroundStyle(Brand.fg)
                }
                Spacer(minLength: 0)
                HStack(spacing: 14) {
                    metric(icon: "flame.fill", value: "\(entry.snapshot.currentStreak)-day streak", tint: Brand.accent)
                    metric(icon: "dollarsign.circle.fill", value: haleMoney(entry.snapshot.moneySaved), tint: Brand.warm)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Brand.bg }
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            Circle().stroke(.white.opacity(0.18), lineWidth: 5)
            Circle().trim(from: 0, to: max(0.02, min(1, entry.milestoneProgress)))
                .stroke(.white, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: -2) {
                Text("\(entry.days)").font(.system(size: 20, weight: .bold, design: .rounded))
                Text("days").font(.system(size: 8, weight: .semibold))
            }
        }
        .widgetAccentable()
        .containerBackground(for: .widget) { Color.clear }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: "leaf.fill").font(.system(size: 11, weight: .semibold))
                Text("\(entry.days) \(entry.days == 1 ? "day" : "days") clean").font(.system(size: 15, weight: .semibold))
            }
            .widgetAccentable()
            haleLiveTimer(entry.snapshot.quitStartMs, font: .system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
            if entry.snapshot.currentStreak > 0 {
                Text("\(entry.snapshot.currentStreak)-day streak · \(haleMoney(entry.snapshot.moneySaved)) saved")
                    .font(.system(size: 11, weight: .regular)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Color.clear }
    }

    private var inline: some View {
        Label("\(entry.days) days clean · \(entry.snapshot.currentStreak)-day streak",
              systemImage: "leaf.fill")
    }

    private func metric(icon: String, value: String, tint: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold)).foregroundStyle(tint)
            Text(value).font(Brand.sora("Sora-SemiBold", 12)).foregroundStyle(Brand.fg)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Live Activity lock-screen banner (param-based so app + widget share it)

struct CleanTimeLockView: View {
    let quitStartMs: Double
    let currentStreak: Int
    let moneySaved: Double
    let milestone: String?

    private var days: Int { haleCleanDays(quitStartMs) }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Color.clear.haleRing(progress: 1, line: 5)
                Image(systemName: "leaf.fill").font(.system(size: 18)).foregroundStyle(Brand.accent)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 2) {
                Text("NICOTINE-FREE").font(Brand.sora("Sora-SemiBold", 9)).tracking(1.3).foregroundStyle(Brand.accent)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(days)").font(Brand.sora("Sora-Bold", 30)).foregroundStyle(Brand.fg)
                    Text(days == 1 ? "day clean" : "days clean").font(Brand.sora("Sora-Medium", 14)).foregroundStyle(Brand.fg2)
                }
                haleLiveTimer(quitStartMs, font: Brand.sora("Sora-SemiBold", 14))
                    .foregroundStyle(Brand.accent2)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 4) {
                stat("flame.fill", "\(currentStreak)", Brand.accent)
                stat("dollarsign.circle.fill", haleMoney(moneySaved), Brand.warm)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }
    private func stat(_ icon: String, _ v: String, _ tint: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold)).foregroundStyle(tint)
            Text(v).font(Brand.sora("Sora-SemiBold", 13)).foregroundStyle(Brand.fg)
        }
    }
}
