import SwiftUI
import WidgetKit

// Debug-only preview of the WidgetKit + Live Activity surfaces, rendered from the
// same shared views the extension uses. Launch with SIMCTL_CHILD_HALE_WIDGET_GALLERY=1
// to screenshot the widgets without placing them on a physical Home/Lock screen.
struct HaleWidgetGalleryView: View {
    // ~3 days, 7h clean — exercises the day count + the within-day live timer.
    private var entry: StreakEntry {
        let now = Date().timeIntervalSince1970 * 1000
        let snap = HaleSnapshot(
            quitStartMs: now - (3 * HaleShared.msPerDay + 7 * 3_600_000 + 24 * 60_000),
            currentStreak: 3, longestStreak: 12, moneySaved: 42.5,
            nextMilestoneLabel: "Sense of taste & smell sharpen",
            nextMilestoneHours: 96, hasBuddy: false, updatedAtMs: now)
        return StreakEntry(date: Date(), snapshot: snap)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                Text("HALE — Widgets & Live Activity")
                    .font(Brand.sora("Sora-Bold", 22)).foregroundStyle(Brand.fg)
                    .padding(.top, 8)

                section("Home Screen — Small") {
                    tile(width: 158, height: 158) {
                        StreakWidgetView(entry: entry).previewContext(WidgetPreviewContext(family: .systemSmall))
                    }
                }
                section("Home Screen — Medium") {
                    tile(width: 338, height: 158) {
                        StreakWidgetView(entry: entry).previewContext(WidgetPreviewContext(family: .systemMedium))
                    }
                }
                section("Lock Screen — Circular / Rectangular / Inline") {
                    HStack(alignment: .center, spacing: 16) {
                        lockTile(width: 72, height: 72) {
                            StreakWidgetView(entry: entry).previewContext(WidgetPreviewContext(family: .accessoryCircular))
                        }
                        lockTile(width: 172, height: 72) {
                            StreakWidgetView(entry: entry).previewContext(WidgetPreviewContext(family: .accessoryRectangular))
                        }
                    }
                    lockTile(width: 240, height: 30) {
                        StreakWidgetView(entry: entry).previewContext(WidgetPreviewContext(family: .accessoryInline))
                    }
                }
                section("Live Activity — Lock Screen banner") {
                    tile(width: 360, height: 92) {
                        CleanTimeLockView(quitStartMs: entry.snapshot.quitStartMs,
                                          currentStreak: entry.snapshot.currentStreak,
                                          moneySaved: entry.snapshot.moneySaved,
                                          milestone: entry.snapshot.nextMilestoneLabel)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Brand.bg2.ignoresSafeArea())
    }

    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased()).font(Brand.sora("Sora-SemiBold", 11)).tracking(1.4).foregroundStyle(Brand.fg3)
            content()
        }
    }
    private func tile<Content: View>(width: CGFloat, height: CGFloat, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .frame(width: width, height: height)
            .background(Brand.bg)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.08)))
    }
    // Lock-screen surfaces render light-on-dark; a wallpaper-ish gray sells the context.
    private func lockTile<Content: View>(width: CGFloat, height: CGFloat, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .foregroundStyle(.white)
            .frame(width: width, height: height)
            .padding(8)
            .background(Color(white: 0.16))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
