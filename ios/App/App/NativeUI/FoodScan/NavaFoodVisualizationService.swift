import CoreGraphics
import Foundation

/// Keeps the pipeline honest until the authenticated native session is wired
/// to the existing private `diet-extract` service.
struct NavaPendingFoodRecognizer: NavaFoodRecognizing {
    func recognizeFood(in image: CGImage) async throws -> NavaFoodRecognitionResult {
        throw NavaFoodScanError.recognitionServiceUnavailable
    }
}

/// Nutrition is derived only from the original-photo result. A generated image
/// is presentation material and must never become nutrition evidence.
struct NavaPassThroughNutritionEnricher: NavaNutritionEnriching {
    func enrich(_ result: NavaFoodRecognitionResult) async throws -> NavaFoodRecognitionResult { result }
}

/// No placeholder result is fabricated when the generator or critic is absent.
struct NavaPendingDishVisualizer: NavaDishVisualizing {
    func renderDish(from recognition: NavaFoodRecognitionResult) async throws -> NavaGeneratedDishAsset {
        throw NavaFoodScanError.visualizationServiceUnavailable
    }
}
