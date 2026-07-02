import Foundation

// Ported from convex/model/streak.ts — streaks are a daily ritual in the USER's
// local day (IANA zone), never UTC. Verified against golden fixtures.
enum Streak {
    // A POSIX/gregorian formatter pinned to a zone → "YYYY-MM-DD" (matches Intl en-CA).
    private static func formatter(_ timezone: String, _ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: timezone) ?? TimeZone(identifier: "UTC")!
        f.dateFormat = pattern
        return f
    }

    static func localDateOf(_ epochMs: Double, timezone: String) -> String {
        formatter(timezone, "yyyy-MM-dd").string(from: Date(timeIntervalSince1970: epochMs / 1000))
    }

    static func localHourOf(_ epochMs: Double, timezone: String) -> Int {
        let s = formatter(timezone, "HH").string(from: Date(timeIntervalSince1970: epochMs / 1000))
        return (Int(s) ?? 0) % 24
    }

    // Calendar-day difference between two YYYY-MM-DD strings (tz already applied).
    static func dayDiff(_ fromLocalDate: String, _ toLocalDate: String) -> Int {
        let utc = formatter("UTC", "yyyy-MM-dd")
        guard let a = utc.date(from: fromLocalDate), let b = utc.date(from: toLocalDate) else { return 0 }
        return Int((b.timeIntervalSince1970 - a.timeIntervalSince1970) / 86_400 + (a <= b ? 0.5 : -0.5))
    }

    struct StreakUpdate: Equatable {
        let newStreak: Int
        let usedFreeze: Bool
        let freezesRemaining: Int
    }

    // Bounded forgiveness: a single missed day is covered by a freeze; larger gap resets to 1.
    static func computeStreakOnCheckIn(
        lastCheckInLocalDate: String?,
        todayLocalDate: String,
        currentStreak: Int,
        freezesRemaining: Int
    ) -> StreakUpdate {
        guard let last = lastCheckInLocalDate else {
            return .init(newStreak: 1, usedFreeze: false, freezesRemaining: freezesRemaining)
        }
        if last == todayLocalDate {
            return .init(newStreak: currentStreak, usedFreeze: false, freezesRemaining: freezesRemaining)
        }
        let gap = dayDiff(last, todayLocalDate)
        if gap == 1 {
            return .init(newStreak: currentStreak + 1, usedFreeze: false, freezesRemaining: freezesRemaining)
        }
        if gap == 2 && freezesRemaining > 0 {
            return .init(newStreak: currentStreak + 1, usedFreeze: true, freezesRemaining: freezesRemaining - 1)
        }
        return .init(newStreak: 1, usedFreeze: false, freezesRemaining: freezesRemaining)
    }
}
