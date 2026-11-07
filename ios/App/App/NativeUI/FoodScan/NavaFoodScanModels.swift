import CoreGraphics
import Foundation

enum NavaFoodScanPhase: String, CaseIterable {
    case cameraReady, capturing, understandingDish, matchingNutrition
    case confirmDish, planningVisual, generatingAsset, validatingAsset, review, failed

    var title: String {
        switch self {
        case .cameraReady: return "将整份餐食完整放入取景框"
        case .capturing: return "正在获取清晰照片"
        case .understandingDish: return "正在理解菜品与可见食材"
        case .matchingNutrition: return "正在匹配营养依据"
        case .confirmDish: return "请确认菜品与可见食材"
        case .planningVisual: return "正在制定标准盘装方案"
        case .generatingAsset: return "正在生成统一展示图"
        case .validatingAsset: return "正在检查菜品一致性与画面质量"
        case .review: return "请核对菜品、份量与重制图"
        case .failed: return "需要重新拍摄或手动校正"
        }
    }

    var progress: Double {
        switch self {
        case .cameraReady: return 0
        case .capturing: return 0.08
        case .understandingDish: return 0.26
        case .matchingNutrition: return 0.44
        case .confirmDish: return 0.52
        case .planningVisual: return 0.58
        case .generatingAsset: return 0.76
        case .validatingAsset: return 0.92
        case .review: return 1
        case .failed: return 0
        }
    }
}

struct NavaFoodMacroEstimate: Codable, Equatable {
    var calories: Double?
    var proteinGrams: Double?
    var carbohydrateGrams: Double?
    var fatGrams: Double?
}

struct NavaFoodCandidate: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var name: String
    var visibleWeightGrams: Double?
    var confidence: Double
    var macros: NavaFoodMacroEstimate
    var note: String?

    var requiresConfirmation: Bool { confidence < 0.78 || visibleWeightGrams == nil }
}

/// Evidence-bound description used to guide image generation. It may describe
/// only the dish and ingredients supported by the user's original photograph.
struct NavaDishVisualIdentity: Codable, Equatable {
    var canonicalDishName: String
    var visibleIngredients: [String]
    var appearanceNotes: String
    var platingNotes: String
    var confidence: Double

    var isReadyForGeneration: Bool {
        confidence >= 0.78 && !canonicalDishName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct NavaFoodRecognitionResult: Codable, Equatable {
    var items: [NavaFoodCandidate]
    var overallConfidence: Double
    var uncertaintyNote: String?
    var modelVersion: String
    var photoStoragePath: String?
    var visualIdentity: NavaDishVisualIdentity?
}

struct NavaNormalizedBounds: Codable, Equatable {
    var minX: Double
    var minY: Double
    var maxX: Double
    var maxY: Double

    var staysInsideSafeCanvas: Bool {
        minX >= 0.06 && minY >= 0.06 && maxX <= 0.94 && maxY <= 0.94 && maxX > minX && maxY > minY
    }
}

/// The backend critic supplies semantic scores; the native client recomputes
/// pixel and alpha fields so server metadata cannot bypass technical checks.
struct NavaDishAssetQuality: Codable, Equatable {
    var pixelWidth: Int
    var pixelHeight: Int
    var hasAlpha: Bool
    var transparentPixelRatio: Double
    var foregroundBounds: NavaNormalizedBounds
    var dishIdentityScore: Double
    var visibleIngredientRecall: Double
    var unexpectedIngredientScore: Double
    var artifactScore: Double
    var plateCompositionPass: Bool
    var hasTextOrWatermark: Bool
    var hasHandsOrUtensils: Bool

    var passesProductionGate: Bool {
        pixelWidth == 1024 && pixelHeight == 1024 && hasAlpha &&
        (0.15...0.80).contains(transparentPixelRatio) && foregroundBounds.staysInsideSafeCanvas &&
        dishIdentityScore >= 0.90 && visibleIngredientRecall >= 0.85 &&
        unexpectedIngredientScore <= 0.05 && artifactScore <= 0.06 &&
        plateCompositionPass && !hasTextOrWatermark && !hasHandsOrUtensils
    }
}

struct NavaGeneratedDishAsset {
    var image: CGImage
    var storagePath: String
    var modelVersion: String
    var promptVersion: String
    var quality: NavaDishAssetQuality

    var isApprovedForDisplay: Bool { quality.passesProductionGate }
}

enum NavaFoodScanError: LocalizedError {
    case cameraPermissionDenied, cameraUnavailable, captureFailed
    case recognitionServiceUnavailable, visualizationServiceUnavailable
    case noFoodRecognized, dishIdentityNeedsConfirmation, generatedAssetRejected, invalidImage

    var errorDescription: String? {
        switch self {
        case .cameraPermissionDenied: return "未获得相机权限。请在系统设置中允许 NAVA 使用相机。"
        case .cameraUnavailable: return "当前设备无法使用相机。"
        case .captureFailed: return "照片获取失败，请保持设备稳定后重试。"
        case .recognitionServiceUnavailable: return "餐食识别服务尚未接入当前原生会话。"
        case .visualizationServiceUnavailable: return "标准盘装图服务或质量检查尚未配置；原照片与识别结果不会丢失。"
        case .noFoodRecognized: return "没有可靠识别出食物，请重新拍摄或手动添加。"
        case .dishIdentityNeedsConfirmation: return "菜品或可见食材置信度不足，请先人工确认，再生成展示图。"
        case .generatedAssetRejected: return "生成图没有通过菜品一致性或画面质量检查，已阻止展示。"
        case .invalidImage: return "照片格式无法处理。"
        }
    }
}

protocol NavaFoodRecognizing {
    func recognizeFood(in image: CGImage) async throws -> NavaFoodRecognitionResult
}

protocol NavaNutritionEnriching {
    func enrich(_ result: NavaFoodRecognitionResult) async throws -> NavaFoodRecognitionResult
}

protocol NavaDishVisualizing {
    func renderDish(from recognition: NavaFoodRecognitionResult) async throws -> NavaGeneratedDishAsset
}
