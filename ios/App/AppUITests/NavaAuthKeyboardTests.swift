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
        let cancelButtons = app.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "Close", "取消", "关闭"]))
        func visibleCancel() -> XCUIElement? {
            cancelButtons.allElementsBoundByIndex.first(where: { $0.isHittable })
        }
        // Either a permission sheet or the picker can appear first.
        let presentation = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            visibleCancel() != nil || permission.exists
        }, object: nil)
        _ = XCTWaiter.wait(for: [presentation], timeout: 60)
        if visibleCancel() == nil && permission.exists {
            capture("system-photo-permission")
            let allowFullAccess = permission.buttons.matching(NSPredicate(
                format: "label IN %@",
                ["Allow Full Access", "Allow Access to All Photos", "允许完全访问", "允许访问所有照片"]
            )).firstMatch
            XCTAssertTrue(allowFullAccess.exists, springboard.debugDescription)
            allowFullAccess.tap()
        }
        let photoPresentation = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in visibleCancel() != nil }, object: nil)
        guard XCTWaiter.wait(for: [photoPresentation], timeout: 30) == .completed, let photoCancel = visibleCancel() else {
            capture("system-photo-not-presented")
            XCTFail(app.debugDescription + "\n" + springboard.debugDescription)
            return
        }
        capture("system-photo-library")
        photoCancel.tap()
        XCTAssertTrue(web.staticTexts["Photo cancelled"].waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertEqual(web.textFields["Preserved draft"].value as? String, "Keep this draft")
        web.buttons["Choose file"].tap()
        // Files starts its remote UI extension lazily on a fresh simulator.
        // Keep the same real presentation/cancel/draft assertions; allow cold start.
        let filePresentation = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in visibleCancel() != nil }, object: nil)
        guard XCTWaiter.wait(for: [filePresentation], timeout: 60) == .completed, let fileCancel = visibleCancel() else {
            capture("system-file-not-presented")
            XCTFail(app.debugDescription + "\n" + springboard.debugDescription)
            return
        }
        capture("system-file-browser")
        fileCancel.tap()
        XCTAssertTrue(web.buttons["Choose file"].waitForExistence(timeout: 10))
        XCTAssertEqual(web.textFields["Preserved draft"].value as? String, "Keep this draft")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(web.textFields["Preserved draft"].waitForExistence(timeout: 10))
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
        if !logo.waitForExistence(timeout: 25) {
            capture("login-logo-not-present")
            XCTFail(app.debugDescription)
            return
        }
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
                revealLoginShortcutsIfNeeded(web, app: app)
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
                assertLoginLayout(web, logo: logo, app: app, english: false, feedback: feedback)
                capture("login-feedback-keyboard")
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
                revealLoginShortcutsIfNeeded(web, app: app)
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
        revealLoginShortcutsIfNeeded(web, app: app)
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
        let language = web.buttons[english ? "Switch language" : "切换语言"].firstMatch
        XCTAssertLessThanOrEqual(language.frame.maxY, logo.frame.minY + 1, "Language and NAVA should be on separate rows")

        for element in [accountLabel, passwordLabel, submit] {
            XCTAssertTrue(element.waitForExistence(timeout: 10), "Missing login element: \(element)")
            XCTAssertTrue(element.isHittable, "Login field or submit hidden: \(element.label)")
            XCTAssertLessThanOrEqual(element.frame.maxY, top + 1)
        }
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
        // XCTest reports accessibility bounds, which differ slightly from the
        // painted artwork. The browser layout test checks the full 8px CSS gap.
        XCTAssertGreaterThanOrEqual(accountLabel.frame.minY, logo.frame.maxY + 4)
        let headerCenterY = (language.frame.maxY + accountLabel.frame.minY - 8) / 2
        XCTAssertEqual(logo.frame.midY, headerCenterY, accuracy: 6,
                       "NAVA must be centered between the language row and the form")
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
        let inputHeight = account.frame.height
        let didScroll = revealLoginShortcutsIfNeeded(web, app: app)
        for element in [divider, code, register] + shortcuts {
            XCTAssertTrue(element.exists, "Missing login route: \(element)")
            XCTAssertTrue(element.isHittable, "Login route hidden: \(element.label)")
            let frame = element.frame
            XCTAssertGreaterThan(frame.height, 0)
            XCTAssertGreaterThanOrEqual(frame.minY, expectedSafeTop)
            XCTAssertLessThanOrEqual(frame.maxY, top + 1, "Login route extends behind keyboard: \(element.label)")
            XCTAssertGreaterThanOrEqual(frame.minX, app.frame.minX)
            XCTAssertLessThanOrEqual(frame.maxX, app.frame.maxX + 1)
        }
        for link in [code, register] {
            XCTAssertGreaterThanOrEqual(link.frame.minY, submit.frame.maxY - 1)
            XCTAssertLessThanOrEqual(link.frame.maxY, divider.frame.minY + 1)
        }
        for shortcut in shortcuts {
            XCTAssertGreaterThanOrEqual(shortcut.frame.minY, divider.frame.maxY - 1)
            XCTAssertEqual(shortcut.frame.midY, shortcuts[0].frame.midY, accuracy: 2)
            // WKWebView may expose only the visible part of a clipped button.
            // Hittability and maxY alone allowed a 22pt fragment to pass. The
            // shortcuts share the input/submit control height at every density.
            XCTAssertGreaterThanOrEqual(shortcut.frame.height, 36,
                                        "Shortcut is clipped: \(shortcut.label)")
            XCTAssertGreaterThanOrEqual(shortcut.frame.height, inputHeight - 1,
                                        "Shortcut must retain the full input control height")
        }
        let shortcutsBottom = shortcuts.map { $0.frame.maxY }.max()!
        XCTAssertGreaterThanOrEqual(top - shortcutsBottom, -1)
        XCTAssertLessThanOrEqual(top - shortcutsBottom, 28, "Excessive space above keyboard")
        if didScroll {
            let start = loginCoordinate(in: web, y: logo.frame.maxY + 40)
            start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 85)))
        }
    }

    @discardableResult
    private func revealLoginShortcutsIfNeeded(_ web: XCUIElement, app: XCUIApplication) -> Bool {
        let top = keyboardTop(in: app)
        // The compact header and form fit in 312 points after safe area and keyboard clearance.
        guard top - expectedSafeTop - 6 < 312 else { return false }
        let last = web.buttons["QQ"].firstMatch
        if last.isHittable && last.frame.height >= 36 && last.frame.maxY <= top { return false }
        let start = loginCoordinate(in: web, y: top - 22)
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -85)))
        return true
    }

    private func loginCoordinate(in web: XCUIElement, y: CGFloat) -> XCUICoordinate {
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0))
            .withOffset(CGVector(dx: 0, dy: y - web.frame.minY))
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
