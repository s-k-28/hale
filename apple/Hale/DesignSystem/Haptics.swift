import UIKit

// Ported from src/lib/haptics.ts — semantic haptics gated by a global toggle
// (persisted to UserDefaults key "hale:hapticsEnabled"). Fire-and-forget, iOS only.
enum Haptics {
    enum Breath { case inhale, exhale }

    static var enabled: Bool {
        get { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
    private static let key = "hale:hapticsEnabled"

    static func select() { guard enabled else { return }; UISelectionFeedbackGenerator().selectionChanged() }
    static func tap()   { impact(.light) }   // secondary/ghost buttons, rows, dismissals
    static func press() { impact(.medium) }  // primary CTAs
    static func heavy() { impact(.heavy) }    // SOS entry, quit-commit
    static func soft()  { impact(.soft) }     // ambient beats
    static func rigid() { impact(.rigid) }
    static func success() { notify(.success) }
    static func warn()    { notify(.warning) }
    static func error()   { notify(.error) }
    static func breath(_ p: Breath) { impact(p == .inhale ? .soft : .light) }

    // crescendo: success @0 → soft @150ms → medium @300ms, each re-checks enabled
    static func celebrate() {
        guard enabled else { return }
        notify(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { soft() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.30) { press() }
    }

    private static func impact(_ s: UIImpactFeedbackGenerator.FeedbackStyle) {
        guard enabled else { return }
        UIImpactFeedbackGenerator(style: s).impactOccurred()
    }
    private static func notify(_ t: UINotificationFeedbackGenerator.FeedbackType) {
        guard enabled else { return }
        UINotificationFeedbackGenerator().notificationOccurred(t)
    }
}
