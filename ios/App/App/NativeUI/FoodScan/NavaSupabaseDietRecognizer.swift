import CoreGraphics
import Foundation
import UIKit

struct NavaAuthenticatedSupabaseSession {
    let projectURL: URL
    let publishableKey: String
    let accessToken: String
    let userID: UUID
}

protocol NavaAuthenticatedSessionProviding {
    func currentSession() async throws -> NavaAuthenticatedSupabaseSession
}

/// Native adapter for the existing private-storage -> `diet-extract` flow.
/// Provider credentials remain in Supabase Edge Function secrets; the app only
/// carries the publishable project key and the signed-in user's short-lived JWT.
struct NavaSupabaseDietRecognizer: NavaFoodRecognizing {
    let sessions: NavaAuthenticatedSessionProviding
    var language = "zh"
    var meal: String?
    var date: String?

    func recognizeFood(in image: CGImage) async throws -> NavaFoodRecognitionResult {
        let session = try await sessions.currentSession()
        let path = try await upload(image, session: session)

        do {
            var request = URLRequest(url: session.projectURL.appendingPathComponent("functions/v1/diet-extract"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(session.publishableKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            request.timeoutInterval = 65
            var body = ["imagePath": path, "lang": language]
            if let meal { body["meal"] = meal }
            if let date { body["date"] = date }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            try validate(response: response, data: data)
            let payload = try JSONDecoder().decode(DietExtractPayload.self, from: data)
            return payload.result(photoStoragePath: path)
        } catch {
            try? await delete(path: path, session: session)
            throw error
        }
    }

    private func upload(_ image: CGImage, session: NavaAuthenticatedSupabaseSession) async throws -> String {
        guard let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.90) else {
            throw NavaFoodScanError.invalidImage
        }
        let path = "\(session.userID.uuidString.lowercased())/native-scans/\(UUID().uuidString.lowercased()).jpg"
        let url = session.projectURL
            .appendingPathComponent("storage/v1/object/diet-photos")
            .appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.setValue(session.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("false", forHTTPHeaderField: "x-upsert")
        request.httpBody = jpeg
        request.timeoutInterval = 45

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return path
    }

    private func delete(path: String, session: NavaAuthenticatedSupabaseSession) async throws {
        let url = session.projectURL
            .appendingPathComponent("storage/v1/object/diet-photos")
            .appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue(session.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            let object = try? JSONSerialization.jsonObject(with: data)
            let dictionary = object as? [String: Any]
            let message = dictionary?["error"] as? String ?? dictionary?["message"] as? String
            throw NavaFoodServiceError.requestFailed(message ?? "餐食识别服务暂时不可用。")
        }
    }
}

private struct DietExtractPayload: Decodable {
    let modelVersion: String
    let confidence: Double
    let note: String?
    let items: [Item]
    let visualPlan: VisualPlan?

    enum CodingKeys: String, CodingKey {
        case modelVersion
        case confidence
        case note
        case items
        case visualPlan = "visual_plan"
    }

    struct VisualPlan: Decodable {
        let canonicalDishName: String
        let visibleIngredients: [String]
        let appearance: String
        let plating: String
        let confidence: Double

        enum CodingKeys: String, CodingKey {
            case canonicalDishName = "canonical_dish_name"
            case visibleIngredients = "visible_ingredients"
            case appearance, plating, confidence
        }
    }

    struct Item: Decodable {
        let name: String
        let weight: Double?
        let calories: Double?
        let protein: Double?
        let carbohydrate: Double?
        let fat: Double?
        let confidence: Double?

        enum CodingKeys: String, CodingKey {
            case name
            case weight = "weight_g"
            case calories
            case protein = "protein_g"
            case carbohydrate = "carbohydrate_g"
            case fat = "fat_g"
            case confidence
        }
    }

    func result(photoStoragePath: String) -> NavaFoodRecognitionResult {
        NavaFoodRecognitionResult(
            items: items.map {
                NavaFoodCandidate(
                    name: $0.name,
                    visibleWeightGrams: $0.weight,
                    confidence: $0.confidence ?? 0,
                    macros: NavaFoodMacroEstimate(
                        calories: $0.calories,
                        proteinGrams: $0.protein,
                        carbohydrateGrams: $0.carbohydrate,
                        fatGrams: $0.fat
                    ),
                    note: nil
                )
            },
            overallConfidence: confidence,
            uncertaintyNote: note,
            modelVersion: modelVersion,
            photoStoragePath: photoStoragePath,
            visualIdentity: visualPlan.map {
                NavaDishVisualIdentity(
                    canonicalDishName: $0.canonicalDishName,
                    visibleIngredients: $0.visibleIngredients,
                    appearanceNotes: $0.appearance,
                    platingNotes: $0.plating,
                    confidence: $0.confidence
                )
            }
        )
    }
}

enum NavaFoodServiceError: LocalizedError {
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .requestFailed(let message): return message
        }
    }
}
