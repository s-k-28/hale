import Foundation

// Ported from convex/model/cohort.ts — quit-stage bucket, computed one way everywhere.
enum QuitStage: String, Codable { case d0_7, d8_30, d31_90, d90plus }

enum Cohort {
    static func quitStage(quitStartMs: Double, nowMs: Double) -> QuitStage {
        let days = Int(floor(max(0, nowMs - quitStartMs) / 86_400_000))
        if days <= 7 { return .d0_7 }
        if days <= 30 { return .d8_30 }
        if days <= 90 { return .d31_90 }
        return .d90plus
    }
}
