import SwiftUI

@main
struct HaleApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    // Launch with SIMCTL_CHILD_HALE_GALLERY=1 to show the Phase 1 component gallery.
    private var galleryMode: Bool { ProcessInfo.processInfo.environment["HALE_GALLERY"] == "1" }

    var body: some Scene {
        WindowGroup {
            Group {
                if galleryMode { GalleryView() } else { RootRouter() }
            }
            .preferredColorScheme(.dark)
        }
    }
}
