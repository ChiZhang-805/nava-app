import XCTest

final class NavaDietDashboardVisualTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testDietDashboardVisualBaseline() throws {
        let environment = ProcessInfo.processInfo.environment
        let scenario = environment["NAVA_VISUAL_SCENARIO"] ?? "iphone-15-pro_zh-default_populated"
        let language = environment["NAVA_VISUAL_LANGUAGE"] ?? "zh-Hans"
        let contentSize = environment["NAVA_VISUAL_CONTENT_SIZE"] ?? "default"
        let state = environment["NAVA_VISUAL_STATE"] ?? "populated"

        let app = XCUIApplication()
        app.launchArguments = [
            "-NavaNativeUI",
            "-NavaVisualTesting",
            "-NavaVisualDietDashboard",
            "-AppleLanguages", "(\(language))",
            "-AppleLocale", language == "zh-Hans" ? "zh_Hans_CN" : "en_US"
        ]
        if contentSize == "accessibility" {
            app.launchArguments += [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityLarge"
            ]
        }
        app.launchEnvironment["NAVA_DIET_VISUAL_STATE"] = state
        app.launchEnvironment["NAVA_VISUAL_FIXED_DATE"] = "2026-11-07T04:00:00Z"
        app.launchEnvironment["NAVA_VISUAL_SCENARIO"] = scenario
        app.launch()

        let dashboard = app.descendants(matching: .any)["diet.dashboard"].firstMatch
        XCTAssertTrue(dashboard.waitForExistence(timeout: 20), "Diet dashboard did not become visible")

        let gauge = app.descendants(matching: .any)["diet.dashboard.gauge"].firstMatch
        let addMeal = app.descendants(matching: .any)["diet.dashboard.add-meal"].firstMatch

        XCTAssertTrue(gauge.waitForExistence(timeout: 5), "Nine-segment gauge is missing")
        XCTAssertTrue(addMeal.exists, "Add-meal control is missing")
        let revealExpectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", "9/9"),
            object: gauge
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [revealExpectation], timeout: 5),
            .completed,
            "Nine-segment gauge did not finish its sequential reveal"
        )

        let screenshot = XCUIScreen.main.screenshot()
        let imageAttachment = XCTAttachment(screenshot: screenshot)
        imageAttachment.name = scenario
        imageAttachment.lifetime = .keepAlways
        add(imageAttachment)

        let measurements = measurementPayload(
            app: app,
            dashboard: dashboard,
            gauge: gauge,
            addMeal: addMeal,
            scenario: scenario,
            state: state,
            language: language,
            contentSize: contentSize
        )
        let data = try JSONSerialization.data(withJSONObject: measurements, options: [.prettyPrinted, .sortedKeys])
        let metricsAttachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        metricsAttachment.name = "\(scenario)-measurements"
        metricsAttachment.lifetime = .keepAlways
        add(metricsAttachment)

        if state == "populated", contentSize == "default" {
            let editLunch = app.descendants(matching: .any)["diet.dashboard.edit.lunch"].firstMatch
            XCTAssertTrue(editLunch.waitForExistence(timeout: 5), "Lunch edit control is missing")
            editLunch.tap()

            let editor = app.descendants(matching: .any)["diet.meal.editor"].firstMatch
            XCTAssertTrue(editor.waitForExistence(timeout: 5), "Meal editor did not open")
            let saveLabel = language == "zh-Hans" ? "保存餐食修改" : "Save meal changes"
            XCTAssertTrue(app.buttons[saveLabel].exists, "Meal editor save control is missing")

            let editorAttachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            editorAttachment.name = "meal-editor"
            editorAttachment.lifetime = .keepAlways
            add(editorAttachment)

            let dinnerLabel = language == "zh-Hans" ? "晚餐" : "Dinner"
            let dinner = app.segmentedControls.buttons[dinnerLabel].firstMatch
            XCTAssertTrue(dinner.waitForExistence(timeout: 5), "Dinner meal-kind option is missing")
            dinner.tap()

            let editorTitle = language == "zh-Hans" ? "编辑晚餐" : "Edit Dinner"
            XCTAssertTrue(
                app.navigationBars[editorTitle].waitForExistence(timeout: 5),
                "Meal editor title did not follow the selected meal kind"
            )
            app.buttons[saveLabel].tap()
            XCTAssertTrue(
                app.staticTexts[dinnerLabel].firstMatch.waitForExistence(timeout: 5),
                "Saved meal kind did not return to the dashboard"
            )
        }
    }

    private func measurementPayload(
        app: XCUIApplication,
        dashboard: XCUIElement,
        gauge: XCUIElement,
        addMeal: XCUIElement,
        scenario: String,
        state: String,
        language: String,
        contentSize: String
    ) -> [String: Any] {
        var elements: [String: Any] = [
            "window": framePayload(app.windows.firstMatch.frame),
            "dashboard": framePayload(dashboard.frame),
            "gauge": framePayload(gauge.frame),
            "addMeal": framePayload(addMeal.frame)
        ]

        for meal in ["lunch", "breakfast"] {
            let element = app.descendants(matching: .any)["diet.dashboard.meal.\(meal)"].firstMatch
            if element.exists {
                elements[meal] = framePayload(element.frame)
            }
        }

        return [
            "scenario": scenario,
            "state": state,
            "language": language,
            "contentSize": contentSize,
            "elements": elements
        ]
    }

    private func framePayload(_ frame: CGRect) -> [String: Double] {
        [
            "x": Double(frame.origin.x),
            "y": Double(frame.origin.y),
            "width": Double(frame.size.width),
            "height": Double(frame.size.height)
        ]
    }
}
