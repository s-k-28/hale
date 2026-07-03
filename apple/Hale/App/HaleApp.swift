import SwiftUI

@main
struct HaleApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    // Launch with SIMCTL_CHILD_HALE_GALLERY=1 to show the Phase 1 component gallery.
    private var galleryMode: Bool { ProcessInfo.processInfo.environment["HALE_GALLERY"] == "1" }
    // SIMCTL_CHILD_HALE_VIZ=1 renders the data-viz demo (charts + share card, mock data)
    // for screenshot review without a live backend.
    private var vizMode: Bool { ProcessInfo.processInfo.environment["HALE_VIZ"] == "1" }
    // SIMCTL_CHILD_HALE_WIDGET_GALLERY=1 renders the WidgetKit + Live Activity surfaces
    // (from the shared widget views) for screenshot review without a live backend.
    private var widgetGalleryMode: Bool { ProcessInfo.processInfo.environment["HALE_WIDGET_GALLERY"] == "1" }
    // SIMCTL_CHILD_HALE_SCREEN=<name> mounts one owned screen in isolation for
    // per-screen screenshot QA (see ScreenGalleryView).
    private var screenName: String? {
        let v = ProcessInfo.processInfo.environment["HALE_SCREEN"] ?? ""
        return v.isEmpty ? nil : v
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if let s = screenName { ScreenGalleryView(which: s) }
                else if widgetGalleryMode { HaleWidgetGalleryView() }
                else if vizMode { VizDemoView() }
                else if galleryMode { GalleryView() }
                else { RootRouter() }
            }
            .preferredColorScheme(.dark)
        }
    }
}
