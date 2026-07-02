import SwiftUI

// Ported from src/ui/Input.tsx.

struct Input: View {
    @Binding var text: String
    var placeholder: String = ""
    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder).font(.sora(.regular, 16)).foregroundStyle(Tok.fg3)
            }
            TextField("", text: $text)
                .font(.sora(.regular, 16))
                .foregroundStyle(Tok.fg)
                .tint(Tok.accent)
        }
        .padding(.horizontal, 18)
        .frame(height: 56)
        .background(Tok.surface2)
        .clipShape(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Tok.R.tile, style: .continuous).strokeBorder(Tok.stroke, lineWidth: 1))
    }
}

// Quiz big-numeral entry — 56pt bold over a 2px underline that turns accent when filled.
struct UnderlineInput: View {
    @Binding var text: String
    var filled: Bool
    var prefix: String? = nil
    var suffix: String? = nil
    var placeholder: String = "0"

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if let prefix {
                Text(prefix).font(.sora(.bold, 42))
                    .foregroundStyle(filled ? Tok.fg : Tok.fg3)
                    .padding(.bottom, 4)
            }
            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(placeholder).font(.sora(.bold, 56)).tracking(-1.68).foregroundStyle(Tok.fg3)
                }
                TextField("", text: $text)
                    .font(.sora(.bold, 56)).tracking(-1.68)
                    .foregroundStyle(Tok.fg)
                    .tint(Tok.accent)
                    .keyboardType(.decimalPad)
            }
            if let suffix {
                Text(suffix).font(.sora(.regular, 18))
                    .foregroundStyle(Tok.fg3)
                    .padding(.bottom, 6)
            }
        }
        .padding(.bottom, 14)
        .overlay(alignment: .bottom) {
            Rectangle().fill(filled ? Tok.accent : Tok.stroke2).frame(height: 2)
        }
    }
}
