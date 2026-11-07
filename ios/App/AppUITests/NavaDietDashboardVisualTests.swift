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

            XCTAssertTrue(
                app.buttons["diet.meal.editor.scope.vegan"].waitForExistence(timeout: 5),
                "The horizontal food-category strip is missing"
            )
            let foodCarousel = app.scrollViews["diet.meal.editor.food-carousel"].firstMatch
            XCTAssertTrue(foodCarousel.waitForExistence(timeout: 5), "The horizontal food-card carousel is missing")
            foodCarousel.swipeLeft()
            foodCarousel.swipeRight()

            let searchPrompt = language == "zh-Hans"
                ? "搜索历史、收藏或常见菜"
                : "Search history, favorites, or foods"
            let searchField = app.searchFields[searchPrompt].firstMatch
            XCTAssertTrue(searchField.waitForExistence(timeout: 5), "Food-library search field is missing")

            let searchTerm = language == "zh-Hans" ? "鸡胸" : "Chicken"
            let foodName = language == "zh-Hans" ? "鸡胸时蔬" : "Chicken and vegetables"
            searchField.tap()
            searchField.typeText(searchTerm)

            let recentFood = app.descendants(matching: .any)["diet.meal.food-card.recent-breakfast"].firstMatch
            XCTAssertTrue(
                recentFood.waitForExistence(timeout: 5),
                "A matching previously eaten food did not appear in search"
            )

            app.swipeUp()
            let favoriteLabel = language == "zh-Hans" ? "收藏\(foodName)" : "Favorite \(foodName)"
            XCTAssertTrue(app.buttons[favoriteLabel].waitForExistence(timeout: 5), "Food favorite control is missing")
            app.buttons[favoriteLabel].tap()

            let viewNutritionLabel = language == "zh-Hans"
                ? "查看\(foodName)营养"
                : "View nutrition for \(foodName)"
            XCTAssertTrue(
                app.buttons[viewNutritionLabel].waitForExistence(timeout: 5),
                "Food-card nutrition flip control is missing"
            )
            app.buttons[viewNutritionLabel].tap()

            let caloriesField = app.textFields["diet.meal.food-card.recent-breakfast.nutrition.calories"].firstMatch
            XCTAssertTrue(
                caloriesField.waitForExistence(timeout: 5),
                "The flipped card does not expose editable nutrition fields"
            )

            let addFoodLabel = language == "zh-Hans"
                ? "加入\(foodName)到本餐"
                : "Add \(foodName) to meal"
            if !app.buttons[addFoodLabel].isHittable {
                app.swipeUp()
            }
            XCTAssertTrue(
                app.buttons[addFoodLabel].waitForExistence(timeout: 5),
                "The flipped food card did not expose its per-food selection control"
            )

            let foodBackAttachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            foodBackAttachment.name = "food-card-back"
            foodBackAttachment.lifetime = .keepAlways
            add(foodBackAttachment)

            app.buttons[addFoodLabel].tap()

            let saveButton = app.buttons[saveLabel]
            XCTAssertTrue(
                saveButton.waitForExistence(timeout: 5),
                "Selecting a search result did not dismiss search and restore the save action"
            )
            saveButton.tap()
            XCTAssertTrue(
                app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", foodName)).firstMatch
                    .waitForExistence(timeout: 5),
                "Selected food did not return to the meal card"
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
