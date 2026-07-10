import SwiftUI

// Community is flag-gated off for v1 (no stranger-visible UGC until moderation
// ships). When viewed, it's a designed "on the way" moment, not a bare stub.
struct CommunityTabView: View {
    var body: some View {
        ZStack {
            HaleBackdrop()
            BrandEmptyState(
                glyph: .buddy, tone: Tok.warm,
                title: "Community is\non the way",
                message: "Soon you'll find groups for exactly what you're quitting: anonymous, moderated, and always on your side. For now, your buddy and squad have your back.",
                eyebrow: "Coming soon")
        }
    }
}

