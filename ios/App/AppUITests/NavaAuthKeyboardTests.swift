import XCTest
import UIKit

/// Exercises the shipped React/WKWebView login, not the optional SwiftUI shell.
final class NavaAuthKeyboardTests: XCTestCase {
    private var expectedSafeTop: CGFloat = 0
    override func setUpWithError() throws { continueAfterFailure = false }

    func testKeyboardKeepsWallpaperAndFieldsInPlace() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_Hans_CN"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let account = web.textFields.firstMatch
        XCTAssertTrue(account.waitForExistence(timeout: 30))
        let logo = web.images["NAVA"].firstMatch
        XCTAssertTrue(logo.waitForExistence(timeout: 10), app.debugDescription)
        // The system status bar is owned by SpringBoard and is not exposed in
        // this app's accessibility tree on iOS 26. These are the two explicit
        // simulator fixtures created by test-ios-auth-keyboard.sh, in points.
        switch app.frame.size {
        case CGSize(width: 430, height: 932): expectedSafeTop = 59
        case CGSize(width: 375, height: 667): expectedSafeTop = 20
        default:
            XCTFail("Missing safe-area fixture for \(app.frame.size)")
            return
        }

        for mode in ["login", "register", "reset", "otp"] {
            if mode == "register" { web.buttons["创建账号"].firstMatch.tap() }
            if mode == "reset" { web.buttons["忘记密码"].firstMatch.tap() }
            if mode == "otp" { web.buttons["验证码登录"].firstMatch.tap() }
            let closedLogo = logo.frame
            capture("\(mode)-closed")
            account.tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
            assertAboveKeyboard(account, logo: logo, app: app)
            capture("\(mode)-account-keyboard")

            // A real touch triggers WKWebView focus assistance. Subsequent
            // fields may require scrolling inside the form on compact phones.
            let fields = web.descendants(matching: .any).matching(NSPredicate(format: "elementType == %d OR elementType == %d", XCUIElement.ElementType.textField.rawValue, XCUIElement.ElementType.secureTextField.rawValue))
            for index in 1..<fields.count {
                let field = fields.element(boundBy: index)
                for _ in 0..<4 where !field.isHittable || field.frame.maxY > app.keyboards.firstMatch.frame.minY {
                    let start = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0))
                        .withOffset(CGVector(dx: 0, dy: app.keyboards.firstMatch.frame.minY - 35))
                    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -100)))
                }
                field.tap()
                assertAboveKeyboard(field, logo: logo, app: app)
                capture("\(mode)-field-\(index)-keyboard")
            }
            logo.tap()
            let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
            XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 10), .completed)
            XCTAssertEqual(logo.frame.minY, closedLogo.minY, accuracy: 2)
            capture("\(mode)-restored")
            if mode != "login" { web.buttons["返回登录"].firstMatch.tap() }
        }
    }

    private func assertAboveKeyboard(_ field: XCUIElement, logo: XCUIElement, app: XCUIApplication) {
        let visible = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            field.frame.minY >= logo.frame.maxY && field.frame.maxY <= app.keyboards.firstMatch.frame.minY
                && logo.frame.minY >= self.expectedSafeTop
        }, object: field)
        XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 8), .completed, app.debugDescription)
    }

    private func capture(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let image = XCTAttachment(screenshot: screenshot)
        image.name = "auth-\(name)"
        image.lifetime = .keepAlways
        add(image)
        if name.hasSuffix("closed") {
            // Accessibility can still expose a WKWebView covered by another
            // native view. Verify real pixels as well as element geometry.
            var samples = [UInt8](repeating: 0, count: 24 * 48)
            samples.withUnsafeMutableBytes { pixels in
                let context = CGContext(data: pixels.baseAddress, width: 24, height: 48,
                    bitsPerComponent: 8, bytesPerRow: 24,
                    space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
                context.draw(screenshot.image.cgImage!, in: CGRect(x: 0, y: 0, width: 24, height: 48))
            }
            let content = (8..<36).flatMap { y in (2..<22).map { x in Int(samples[y * 24 + x]) } }
            XCTAssertGreaterThan(content.max()! - content.min()!, 40,
                "The app's content is covered by a flat native layer.")
        }
    }
}
