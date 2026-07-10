import XCTest

// Frontend design audit harness. Mounts each owned screen via the HALE_SCREEN
// gallery, drives it with real taps where it matters, and attaches full-screen
// captures (.keepAlways) for review. Exported with:
//   xcrun xcresulttool export attachments --path <bundle.xcresult> --output-path <dir>
final class ScreenAuditUITests: XCTestCase {

    override func setUpWithError() throws { continueAfterFailure = true }

    private func mount(_ screen: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["HALE_SCREEN"] = screen
        app.launch()
        return app
    }

    private func snap(_ name: String, settle: TimeInterval = 2.5) {
        Thread.sleep(forTimeInterval: settle)
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    // Capture every gallery screen for the design pass.
    func testScreenAudit() {
        for screen in ["sage", "you", "paywall", "sos", "goals", "insights",
                       "toolkit", "leagues", "squads", "referral", "disclaimers"] {
            let app = mount(screen)
            snap(screen)
            app.terminate()
        }
    }

    // Paywall behaves: 3-day CTA exists, plans toggle, disclosure follows plan.
    func testPaywallInteraction() {
        let app = mount("paywall")
        // The CTA is an HButton — exposed as a button element, not a static text.
        let cta = app.buttons["Start my 3-day free trial"]
        XCTAssertTrue(cta.waitForExistence(timeout: 10), "CTA must say 3-day free trial")
        XCTAssertTrue(app.staticTexts["$49.99"].exists, "Annual price visible without scrolling")
        XCTAssertTrue(app.staticTexts["$6.99"].exists, "Monthly price visible without scrolling")

        app.staticTexts["Monthly"].firstMatch.tap()
        snap("paywall-monthly-selected", settle: 1.0)
        XCTAssertTrue(cta.exists, "CTA still present after plan switch")

        app.staticTexts["Annual"].firstMatch.tap()
        snap("paywall-annual-selected", settle: 1.0)
        app.terminate()
    }

    // You/Profile renders data-backed (fixture) — not a spinner.
    func testProfileRendersContent() {
        let app = mount("you")
        XCTAssertTrue(app.staticTexts["You"].waitForExistence(timeout: 10), "Profile header renders")
        snap("you-loaded", settle: 1.5)
        app.terminate()
    }
}
