import XCTest

final class NavaDietDashboardVisualTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testDietDashboardVisualBaseline() throws {
        let environment = ProcessInfo.processInfo.environment
        let scenario = environment["NAVA_VISUAL_SCENARIO"] ?? "local"
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
