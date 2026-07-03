import WidgetKit
import SwiftUI

@main
struct HaleWidgetBundle: WidgetBundle {
    var body: some Widget {
        StreakWidget()
        #if canImport(ActivityKit)
        CleanTimeLiveActivity()
        #endif
    }
}
