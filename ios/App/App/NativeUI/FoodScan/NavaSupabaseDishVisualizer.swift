import CoreGraphics
import Foundation
import ImageIO

/// Calls the private generation + critic harness. The backend will not return
/// an asset unless semantic QA passes; this client independently verifies the
/// PNG dimensions, alpha coverage, and safe canvas bounds before display.
struct NavaSupabaseDishVisualizer: NavaDishVisualizing {
    let sessions: NavaAuthenticatedSessionProviding

    func renderDish(from recognition: NavaFoodRecognitionResult) async throws -> NavaGeneratedDishAsset {
        guard let imagePath = recognition.photoStoragePath,
              let identity = recognition.visualIdentity,
              identity.isReadyForGeneration else {
            throw NavaFoodScanError.dishIdentityNeedsConfirmation
        }

        let session = try await sessions.currentSession()
        let url = session.projectURL.appendingPathComponent("functions/v1/food-visualize")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(session.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 150
        request.httpBody = try JSONEncoder().encode(RenderRequest(imagePath: imagePath, visualPlan: identity))

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        let payload = try JSONDecoder().decode(RenderResponse.self, from: data)

        let (imageData, imageResponse) = try await URLSession.shared.data(from: payload.assetURL)
        try validate(response: imageResponse, data: imageData)
        guard let source = CGImageSourceCreateWithData(imageData as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw NavaFoodScanError.invalidImage
        }

        let technical = try NavaDishTechnicalValidator.inspect(image)
        let quality = NavaDishAssetQuality(
            pixelWidth: technical.width,
            pixelHeight: technical.height,
            hasAlpha: technical.hasAlpha,
            transparentPixelRatio: technical.transparentPixelRatio,
            foregroundBounds: technical.foregroundBounds,
            dishIdentityScore: payload.quality.dishIdentityScore,
            visibleIngredientRecall: payload.quality.visibleIngredientRecall,
            unexpectedIngredientScore: payload.quality.unexpectedIngredientScore,
            artifactScore: payload.quality.artifactScore,
            plateCompositionPass: payload.quality.plateCompositionPass,
            hasTextOrWatermark: payload.quality.hasTextOrWatermark,
            hasHandsOrUtensils: payload.quality.hasHandsOrUtensils
        )
        guard quality.passesProductionGate else { throw NavaFoodScanError.generatedAssetRejected }
        return NavaGeneratedDishAsset(
            image: image,
            storagePath: payload.assetPath,
            modelVersion: payload.modelVersion,
            promptVersion: payload.promptVersion,
            quality: quality
        )
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let message = object?["error"] as? String ?? object?["message"] as? String
            throw NavaFoodServiceError.requestFailed(message ?? "盘装图生成或质量检查暂时不可用。")
        }
    }
}

private struct RenderRequest: Encodable {
    let imagePath: String
    let visualPlan: NavaDishVisualIdentity
}

private struct RenderResponse: Decodable {
    let assetURL: URL
    let assetPath: String
    let modelVersion: String
    let promptVersion: String
    let quality: SemanticQuality

    enum CodingKeys: String, CodingKey {
        case assetURL = "assetUrl"
        case assetPath, modelVersion, promptVersion, quality
    }

    struct SemanticQuality: Decodable {
        let dishIdentityScore: Double
        let visibleIngredientRecall: Double
        let unexpectedIngredientScore: Double
        let artifactScore: Double
        let plateCompositionPass: Bool
        let hasTextOrWatermark: Bool
        let hasHandsOrUtensils: Bool
    }
}

private enum NavaDishTechnicalValidator {
    struct Result {
        let width: Int
        let height: Int
        let hasAlpha: Bool
        let transparentPixelRatio: Double
        let foregroundBounds: NavaNormalizedBounds
    }

    static func inspect(_ image: CGImage) throws -> Result {
        let width = image.width
        let height = image.height
        let hasAlpha = ![CGImageAlphaInfo.none, .noneSkipFirst, .noneSkipLast].contains(image.alphaInfo)
        guard hasAlpha, width > 0, height > 0 else { throw NavaFoodScanError.generatedAssetRejected }

        let bytesPerRow = width * 4
        var pixels = [UInt8](repeating: 0, count: bytesPerRow * height)
        let rendered = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let baseAddress = buffer.baseAddress,
                  let context = CGContext(
                    data: baseAddress,
                    width: width,
                    height: height,
                    bitsPerComponent: 8,
                    bytesPerRow: bytesPerRow,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
                  ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard rendered else { throw NavaFoodScanError.invalidImage }

        var transparent = 0
        var minX = width, minY = height, maxX = -1, maxY = -1
        for y in 0..<height {
            for x in 0..<width {
                let alpha = pixels[y * bytesPerRow + x * 4 + 3]
                if alpha <= 8 {
                    transparent += 1
                } else {
                    minX = min(minX, x); minY = min(minY, y)
                    maxX = max(maxX, x); maxY = max(maxY, y)
                }
            }
        }
        guard maxX >= minX, maxY >= minY else { throw NavaFoodScanError.generatedAssetRejected }
        let total = Double(width * height)
        return Result(
            width: width,
            height: height,
            hasAlpha: hasAlpha,
            transparentPixelRatio: Double(transparent) / total,
            foregroundBounds: NavaNormalizedBounds(
                minX: Double(minX) / Double(width),
                minY: Double(minY) / Double(height),
                maxX: Double(maxX + 1) / Double(width),
                maxY: Double(maxY + 1) / Double(height)
            )
        )
    }
}
