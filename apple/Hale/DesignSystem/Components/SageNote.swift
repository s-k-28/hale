import SwiftUI

// Ported from src/ui/SageNote.tsx — Sage's voice as pure typography with a left
// accent rule (a "quote rule", never a chat bubble).
struct SageNote: View {
    let message: String
    var chip: Bool = true

    private var inner: some View {
        VStack(alignment: .leading, spacing: 4) {
            Txt.Eyebrow("Sage", color: Tok.accent)
            Text(message)
                .font(.sora(.medium, 15))
                .lineSpacing(5)
                .foregroundStyle(Tok.fg)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var body: some View {
        if chip {
            inner
                .padding(.vertical, 12)
                .padding(.leading, 16)
                .padding(.trailing, 16)
                .background(Tok.surface)
                .clipShape(.rect(topLeadingRadius: 0, bottomLeadingRadius: 0,
                                 bottomTrailingRadius: 16, topTrailingRadius: 16))
                .overlay(alignment: .leading) {
                    Rectangle().fill(Tok.accentDeep).frame(width: 2)
                }
        } else {
            inner
        }
    }
}
