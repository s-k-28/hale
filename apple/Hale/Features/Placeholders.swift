import SwiftUI

// Cycle-1 stubs — replaced by full screens in the next 4a passes. Each renders with
// the design system so navigation + tab bar are exercisable now.

private struct Stub: View {
    let eyebrow: String, title: String, note: String
    var body: some View {
        Screen {
            VStack(alignment: .leading, spacing: 12) {
                Spacer()
                Txt.Eyebrow(eyebrow, color: Tok.accent)
                Txt.H1(title)
                Txt.Body(note)
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tok.gutter)
        }
    }
}

struct CommunityTabView: View { var body: some View { Stub(eyebrow: "Community", title: "Community", note: "Flag-gated off in v1.") } }

