import XCTest
import UIKit

/// Exercises the shipped React/WKWebView login, not the optional SwiftUI shell.
final class NavaAuthKeyboardTests: XCTestCase {
    private var expectedSafeTop: CGFloat = 0
    override func setUpWithError() throws { continueAfterFailure = false }

    func testSystemPhotoAndFilePickerCancellationPreservesDraft() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-NavaPickerBoundaryTest", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let web = app.webViews.firstMatch
        let library = web.buttons["Photo library"].firstMatch
        XCTAssertTrue(library.waitForExistence(timeout: 30), app.debugDescription)
        library.tap()
        // Photo access is a SpringBoard alert, outside the app's hierarchy.
        // A fresh simulator has no saved permission choice.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let permission = springboard.alerts.firstMatch
        // Photos/TCC starts lazily on clean cloud simulators. Wait for the
        // actual system permission UI instead of skipping a late prompt.
        if permission.waitForExistence(timeout: 60) {
            capture("system-photo-permission")
            let allowFullAccess = permission.buttons.matching(NSPredicate(
                format: "label IN %@",
                ["Allow Full Access", "Allow Access to All Photos", "允许完全访问", "允许访问所有照片"]
            )).firstMatch
            XCTAssertTrue(allowFullAccess.exists, springboard.debugDescription)
            allowFullAccess.tap()
        }
        let cancel = app.buttons["Cancel"].firstMatch
        if !cancel.waitForExistence(timeout: 30) {
            capture("system-photo-not-presented")
            XCTFail(app.debugDescription + "\n" + springboard.debugDescription)
        }
        capture("system-photo-library")
        cancel.tap()
        XCTAssertTrue(web.staticTexts["Photo cancelled"].waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertEqual(web.textFields["Preserved draft"].value as? String, "Keep this draft")
        web.buttons["Choose file"].tap()
        XCTAssertTrue(cancel.waitForExistence(timeout: 15), app.debugDescription)
        capture("system-file-browser")
        cancel.tap()
        XCTAssertTrue(web.buttons["Choose file"].waitForExistence(timeout: 10))
        XCTAssertEqual(web.textFields["Preserved draft"].value as? String, "Keep this draft")
        capture("picker-return-draft")
    }

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
            if !app.keyboards.firstMatch.waitForExistence(timeout: 10) {
                capture("\(mode)-keyboard-not-presented")
                XCTFail(app.debugDescription + "\n" + XCUIApplication(bundleIdentifier: "com.apple.springboard").debugDescription)
            }
            capture("\(mode)-account-keyboard")
            assertAboveKeyboard(account, logo: logo, app: app)

            if mode == "login" {
                assertLoginLayout(web, logo: logo, app: app, english: false)
                // Exercise a real feedback state, then reopen the actual iOS
                // keyboard. An empty feedback slot missed the previous grid bug.
                web.buttons["微信"].firstMatch.tap()
                let feedback = web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "尚未完成服务配置")).firstMatch
                XCTAssertTrue(feedback.waitForExistence(timeout: 10), app.debugDescription)
                account.tap()
                XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
                assertAboveKeyboard(account, logo: logo, app: app)
                let password = web.secureTextFields.firstMatch
                let submit = web.buttons["进入 NAVA"].firstMatch
                XCTAssertGreaterThanOrEqual(feedback.frame.minY, password.frame.maxY)
                XCTAssertLessThanOrEqual(feedback.frame.maxY, submit.frame.minY + 1)
                XCTAssertEqual(submit.frame.width, account.frame.width, accuracy: 4)
                assertLoginLayout(web, logo: logo, app: app, english: false, feedback: feedback)
                capture("login-feedback-keyboard")
                for name in ["微信", "Apple", "QQ", "验证码登录", "创建账号"] {
                    XCTAssertTrue(web.buttons[name].firstMatch.exists, "Missing login route: \(name)")
                    XCTAssertTrue(web.buttons[name].firstMatch.isHittable, "Login route requires scrolling: \(name)")
                }
                let qq = web.buttons["QQ"].firstMatch
                do {
                    XCTAssertTrue(qq.isHittable)
                    let gap = keyboardTop(in: app) - qq.frame.maxY
                    XCTAssertGreaterThanOrEqual(gap, 0)
                    XCTAssertLessThanOrEqual(gap, 28, "Excessive space above keyboard")
                    XCTAssertTrue(web.buttons["微信"].firstMatch.isHittable)
                    XCTAssertTrue(web.buttons["Apple"].firstMatch.isHittable)
                }
            }

            // A real touch triggers WKWebView focus assistance. Subsequent
            // fields may require scrolling inside the form on compact phones.
            let fields = web.descendants(matching: .any).matching(NSPredicate(format: "elementType == %d OR elementType == %d", XCUIElement.ElementType.textField.rawValue, XCUIElement.ElementType.secureTextField.rawValue))
            for index in 1..<fields.count {
                let field = fields.element(boundBy: index)
                if mode == "login" { XCTAssertTrue(field.isHittable, "Login must never require scrolling") }
                for _ in 0..<(mode == "login" ? 0 : 4) where !field.isHittable || field.frame.maxY > keyboardTop(in: app) {
                    let start = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0))
                        .withOffset(CGVector(dx: 0, dy: keyboardTop(in: app) - 20))
                    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -100)))
                }
                field.tap()
                capture("\(mode)-field-\(index)-keyboard")
                assertAboveKeyboard(field, logo: logo, app: app)
                if mode == "login" {
                    let feedback = web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "尚未完成服务配置")).firstMatch
                    assertLoginLayout(web, logo: logo, app: app, english: false, feedback: feedback)
                }
            }
            if mode == "login" {
                let qq = web.buttons["QQ"].firstMatch
                XCTAssertTrue(qq.isHittable)
                XCTAssertLessThanOrEqual(qq.frame.maxY, keyboardTop(in: app))
                capture("login-shortcuts-keyboard")
            }
            logo.tap()
            let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
            XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 10), .completed)
            XCTAssertEqual(logo.frame.minY, closedLogo.minY, accuracy: 2)
            capture("\(mode)-restored")
            if mode != "login" { web.buttons["返回登录"].firstMatch.tap() }
        }

        // Exercise the actual app language control: OS launch locale alone
        // does not change a previously saved NAVA language preference.
        web.buttons["切换语言"].firstMatch.tap()
        XCTAssertTrue(web.staticTexts["Account"].firstMatch.waitForExistence(timeout: 10))
        account.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        assertAboveKeyboard(account, logo: logo, app: app)
        assertLoginLayout(web, logo: logo, app: app, english: true)
        capture("login-english-account-keyboard")
        web.buttons["WeChat"].firstMatch.tap()
        let englishFeedback = web.staticTexts["This sign-in method is not configured yet."].firstMatch
        XCTAssertTrue(englishFeedback.waitForExistence(timeout: 10), app.debugDescription)
        account.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        assertLoginLayout(web, logo: logo, app: app, english: true, feedback: englishFeedback)
        let englishPassword = web.secureTextFields.firstMatch
        XCTAssertTrue(englishPassword.isHittable, "English password must never require scrolling")
        englishPassword.tap()
        assertAboveKeyboard(englishPassword, logo: logo, app: app)
        assertLoginLayout(web, logo: logo, app: app, english: true, feedback: englishFeedback)
        capture("login-english-feedback-password-keyboard")
        logo.tap()
        let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 10), .completed)
        web.buttons["Switch language"].firstMatch.tap()
    }

    private func assertLoginLayout(_ web: XCUIElement, logo: XCUIElement, app: XCUIApplication,
                                   english: Bool, feedback: XCUIElement? = nil) {
        let accountLabel = web.staticTexts[english ? "Account" : "账号"].firstMatch
        let passwordLabel = web.staticTexts[english ? "Password" : "密码"].firstMatch
        let divider = web.staticTexts[english ? "Or continue with" : "或使用快捷登录"].firstMatch
        let account = web.textFields.firstMatch
        let password = web.secureTextFields.firstMatch
        let submit = web.buttons[english ? "Enter NAVA" : "进入 NAVA"].firstMatch
        let code = web.buttons[english ? "Code sign-in" : "验证码登录"].firstMatch
        let register = web.buttons[english ? "Create account" : "创建账号"].firstMatch
        let shortcuts = [english ? "WeChat" : "微信", "Apple", "QQ"].map { web.buttons[$0].firstMatch }
        let top = keyboardTop(in: app)

        // Presence alone is insufficient: hidden labels and offscreen routes
        // used to pass while the user had to scroll to discover the remainder.
        for element in [accountLabel, passwordLabel, divider, code, register] + shortcuts {
            XCTAssertTrue(element.waitForExistence(timeout: 10), "Missing login element: \(element)")
            XCTAssertTrue(element.isHittable, "Login element hidden or requires scrolling: \(element.label)")
            let frame = element.frame
            XCTAssertGreaterThan(frame.height, 0)
            XCTAssertGreaterThanOrEqual(frame.minY, expectedSafeTop)
            XCTAssertLessThanOrEqual(frame.maxY, top + 1, "Login element extends behind keyboard: \(element.label)")
            XCTAssertGreaterThanOrEqual(frame.minX, app.frame.minX)
            XCTAssertLessThanOrEqual(frame.maxX, app.frame.maxX + 1)
        }
        XCTAssertTrue(submit.exists)
        XCTAssertGreaterThan(submit.frame.height, 0)
        // XCTest exposes the editable <input>, not its ContinuousField surface.
        // The surface has 14pt horizontal padding plus a 1pt border on each
        // side (product-ui.css). Compare both outer edges, not the smaller
        // editable width against the full-width submit button. Separate edge
        // assertions still reject an off-centre or narrowed submit button.
        let accountSurface = account.frame.insetBy(dx: -15, dy: 0)
        XCTAssertEqual(submit.frame.minX, accountSurface.minX, accuracy: 2,
                       "Submit must align with the account surface's left edge")
        XCTAssertEqual(submit.frame.maxX, accountSurface.maxX, accuracy: 2,
                       "Submit must align with the account surface's right edge")
        XCTAssertGreaterThanOrEqual(accountLabel.frame.minY, logo.frame.maxY - 1)
        XCTAssertLessThanOrEqual(accountLabel.frame.maxY, account.frame.minY + 1)
        XCTAssertGreaterThanOrEqual(passwordLabel.frame.minY, account.frame.maxY - 1)
        XCTAssertLessThanOrEqual(passwordLabel.frame.maxY, password.frame.minY + 1)
        XCTAssertGreaterThanOrEqual(submit.frame.minY, password.frame.maxY - 1)
        if let feedback {
            XCTAssertTrue(feedback.exists)
            XCTAssertTrue(feedback.isHittable, "Feedback must remain readable above the keyboard")
            XCTAssertGreaterThanOrEqual(feedback.frame.minY, password.frame.maxY - 1)
            XCTAssertLessThanOrEqual(feedback.frame.maxY, submit.frame.minY + 1)
        }
        for link in [code, register] {
            XCTAssertGreaterThanOrEqual(link.frame.minY, submit.frame.maxY - 1)
            XCTAssertLessThanOrEqual(link.frame.maxY, divider.frame.minY + 1)
        }
        for shortcut in shortcuts {
            XCTAssertGreaterThanOrEqual(shortcut.frame.minY, divider.frame.maxY - 1)
            XCTAssertEqual(shortcut.frame.midY, shortcuts[0].frame.midY, accuracy: 2)
        }
        let shortcutsBottom = shortcuts.map { $0.frame.maxY }.max()!
        XCTAssertGreaterThanOrEqual(top - shortcutsBottom, -1)
        XCTAssertLessThanOrEqual(top - shortcutsBottom, 28, "Excessive space above keyboard")
    }

    private func assertAboveKeyboard(_ field: XCUIElement, logo: XCUIElement, app: XCUIApplication) {
        let visible = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            // Each frame query asks the simulator for a fresh accessibility
            // snapshot. Reuse that result rather than querying the same view
            // twice inside one predicate (slow cloud runners can exceed 8s).
            let fieldFrame = field.frame
            let logoFrame = logo.frame
            let keyboardTop = self.keyboardTop(in: app)
            return fieldFrame.minY >= logoFrame.maxY && fieldFrame.maxY <= keyboardTop
                && logoFrame.minY >= self.expectedSafeTop && fieldFrame.height > 0
        }, object: field)
        XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 30), .completed, app.debugDescription)
    }

    private func keyboardTop(in app: XCUIApplication) -> CGFloat {
        // XCTest's Keyboard frame excludes WebKit's Previous/Next/Done bar.
        // Fields and scroll gestures must stay above that accessory as well.
        let keysTop = app.keyboards.firstMatch.frame.minY
        return app.toolbars.allElementsBoundByIndex.reduce(keysTop) { top, toolbar in
            let frame = toolbar.frame
            return frame.height > 0 ? min(top, frame.minY) : top
        }
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
