import SwiftUI

@MainActor
final class NavaFoodScanViewModel: ObservableObject {
    @Published var phase: NavaFoodScanPhase = .cameraReady
    @Published var sourceImage: CGImage?
    @Published var generatedAsset: NavaGeneratedDishAsset?
    @Published var recognition: NavaFoodRecognitionResult?
    @Published var message: String?

    private let recognizer: NavaFoodRecognizing
    private let nutrition: NavaNutritionEnriching
    private let visualizer: NavaDishVisualizing

    init(
        recognizer: NavaFoodRecognizing = NavaPendingFoodRecognizer(),
        nutrition: NavaNutritionEnriching = NavaPassThroughNutritionEnricher(),
        visualizer: NavaDishVisualizing = NavaPendingDishVisualizer()
    ) {
        self.recognizer = recognizer
        self.nutrition = nutrition
        self.visualizer = visualizer
    }

    func process(_ image: CGImage) async {
        sourceImage = image
        generatedAsset = nil
        recognition = nil
        message = nil

        do {
            withAnimation(.easeInOut(duration: 0.25)) { phase = .understandingDish }
            let recognized = try await recognizer.recognizeFood(in: image)
            guard !recognized.items.isEmpty else { throw NavaFoodScanError.noFoodRecognized }

            withAnimation(.easeInOut(duration: 0.25)) { phase = .matchingNutrition }
            let enriched = try await nutrition.enrich(recognized)
            recognition = enriched
            guard enriched.visualIdentity?.isReadyForGeneration == true else {
                withAnimation(.easeInOut(duration: 0.25)) { phase = .confirmDish }
                return
            }
            try await generateDisplayAsset(from: enriched)
        } catch {
            message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            withAnimation(.easeInOut(duration: 0.25)) { phase = .failed }
        }
    }

    func reset() {
        sourceImage = nil
        generatedAsset = nil
        recognition = nil
        message = nil
        phase = .cameraReady
    }

    func applyConfirmedResult(_ result: NavaFoodRecognitionResult) {
        recognition = result
    }

    func confirmDishIdentity(_ identity: NavaDishVisualIdentity) async {
        guard var result = recognition else { return }
        result.visualIdentity = identity
        recognition = result
        message = nil
        do {
            guard identity.isReadyForGeneration else { throw NavaFoodScanError.dishIdentityNeedsConfirmation }
            try await generateDisplayAsset(from: result)
        } catch {
            message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            withAnimation(.easeInOut(duration: 0.25)) { phase = .failed }
        }
    }

    private func generateDisplayAsset(from result: NavaFoodRecognitionResult) async throws {
        withAnimation(.easeInOut(duration: 0.25)) { phase = .planningVisual }
        withAnimation(.easeInOut(duration: 0.25)) { phase = .generatingAsset }
        let asset = try await visualizer.renderDish(from: result)
        withAnimation(.easeInOut(duration: 0.25)) { phase = .validatingAsset }
        guard asset.isApprovedForDisplay else { throw NavaFoodScanError.generatedAssetRejected }
        withAnimation(.spring(response: 0.55, dampingFraction: 0.84)) { generatedAsset = asset }
        withAnimation(.easeOut(duration: 0.3)) { phase = .review }
    }
}

struct NavaFoodScanView: View {
    @StateObject private var camera = NavaFoodCameraService()
    @StateObject private var model: NavaFoodScanViewModel
    @State private var showingReview = false
    @State private var showingDishConfirmation = false
    @Environment(\.dismiss) private var dismiss
    private let onConfirm: ((NavaFoodRecognitionResult, NavaGeneratedDishAsset?) -> Void)?

    init(
        recognizer: NavaFoodRecognizing = NavaPendingFoodRecognizer(),
        nutrition: NavaNutritionEnriching = NavaPassThroughNutritionEnricher(),
        visualizer: NavaDishVisualizing = NavaPendingDishVisualizer(),
        onConfirm: ((NavaFoodRecognitionResult, NavaGeneratedDishAsset?) -> Void)? = nil
    ) {
        _model = StateObject(wrappedValue: NavaFoodScanViewModel(
            recognizer: recognizer,
            nutrition: nutrition,
            visualizer: visualizer
        ))
        self.onConfirm = onConfirm
    }

    var body: some View {
        ZStack {
            NavaColor.ink.ignoresSafeArea()
            cameraOrResult
            scanOverlay
        }
        .foregroundStyle(.white)
        .toolbar(.hidden, for: .tabBar)
        .navigationBarBackButtonHidden(true)
        .task { await camera.prepare() }
        .onDisappear { camera.stop() }
        .sheet(isPresented: $showingReview) {
            if let result = model.recognition {
                NavaFoodReviewSheet(result: result, canSave: onConfirm != nil) { confirmed in
                    model.applyConfirmedResult(confirmed)
                    onConfirm?(confirmed, model.generatedAsset)
                }
            }
        }
        .sheet(isPresented: $showingDishConfirmation) {
            if let result = model.recognition {
                NavaDishIdentitySheet(result: result) { identity in
                    Task { await model.confirmDishIdentity(identity) }
                }
            }
        }
    }

    @ViewBuilder
    private var cameraOrResult: some View {
        if let asset = model.generatedAsset,
           model.phase != .cameraReady,
           model.phase != .capturing {
            ZStack {
                NavaSceneBackground()
                NavaPlateComposition(image: asset.image, isComplete: model.phase == .review)
                    .padding(.horizontal, 28)
                    .transition(.scale(scale: 0.84).combined(with: .opacity))
                VStack {
                    Spacer()
                    Label("AI 重制展示图 · 已通过一致性检查", systemImage: "checkmark.seal.fill")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(.thinMaterial, in: Capsule())
                        .padding(.bottom, 150)
                }
            }
        } else if let image = model.sourceImage,
                  model.phase != .cameraReady,
                  model.phase != .capturing {
            ZStack {
                NavaColor.ink
                Image(decorative: image, scale: 1, orientation: .up)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .stroke(.white.opacity(0.78), lineWidth: 1)
                    }
                    .padding(.horizontal, 20)
            }
        } else if camera.authorizationDenied {
            VStack(spacing: 14) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 44))
                Text("需要相机权限")
                    .font(.title2.weight(.bold))
                Text("请在系统设置中允许 NAVA 使用相机。")
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.72))
                    .multilineTextAlignment(.center)
            }
            .padding(28)
        } else {
            NavaCameraPreview(session: camera.session)
                .ignoresSafeArea()
        }
    }

    private var scanOverlay: some View {
        VStack(spacing: 14) {
            HStack {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.headline.weight(.bold))
                        .frame(width: 46, height: 46)
                        .background(.ultraThinMaterial, in: Circle())
                }
                Spacer()
                Text("餐食扫描")
                    .font(.headline.weight(.bold))
                Spacer()
                Button(action: model.reset) {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.headline.weight(.bold))
                        .frame(width: 46, height: 46)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .opacity(model.sourceImage == nil ? 0 : 1)
                .disabled(model.sourceImage == nil)
            }

            Spacer()

            if model.phase == .cameraReady || model.phase == .capturing {
                NavaScanReticle(isActive: model.phase == .capturing)
                    .frame(maxWidth: 430, maxHeight: 430)
            }

            Spacer()

            VStack(spacing: 10) {
                Text(model.phase.title)
                    .font(.headline.weight(.semibold))
                ProgressView(value: model.phase.progress)
                    .tint(.white)
                    .opacity(model.phase == .cameraReady ? 0 : 1)
                if let message = model.message {
                    Text(message)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.78))
                }
            }
            .padding(.horizontal, 20)

            if model.phase == .cameraReady || model.phase == .capturing {
                Button {
                    Task {
                        model.phase = .capturing
                        do {
                            let image = try await camera.capture()
                            await model.process(image)
                        } catch {
                            model.message = error.localizedDescription
                            model.phase = .failed
                        }
                    }
                } label: {
                    Circle()
                        .fill(.white)
                        .frame(width: 76, height: 76)
                        .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 7).padding(-7))
                }
                .accessibilityLabel("拍摄餐食")
                .disabled(!camera.isReady || model.phase == .capturing)
            } else if model.phase == .review {
                NavaPrimaryButton(title: "核对食物与份量", icon: "checkmark") {
                    showingReview = true
                }
                    .padding(.horizontal, 20)
            } else if model.phase == .confirmDish {
                NavaPrimaryButton(title: "确认菜品后生成", icon: "checkmark.bubble") {
                    showingDishConfirmation = true
                }
                .padding(.horizontal, 20)
            } else if model.phase == .failed {
                VStack(spacing: 10) {
                    if model.recognition != nil {
                        NavaPrimaryButton(title: "修改菜品并重试", icon: "pencil") {
                            showingDishConfirmation = true
                        }
                    }
                    Button("重新拍摄", action: model.reset)
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .foregroundStyle(NavaColor.ink)
                }
                .padding(.horizontal, 20)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

private struct NavaDishIdentitySheet: View {
    @State private var dishName: String
    @State private var visibleIngredients: String
    @State private var appearance: String
    @State private var plating: String
    @Environment(\.dismiss) private var dismiss
    let onConfirm: (NavaDishVisualIdentity) -> Void

    init(result: NavaFoodRecognitionResult, onConfirm: @escaping (NavaDishVisualIdentity) -> Void) {
        let identity = result.visualIdentity
        _dishName = State(initialValue: identity?.canonicalDishName ?? result.items.map(\.name).joined(separator: "、"))
        _visibleIngredients = State(initialValue: identity?.visibleIngredients.joined(separator: "、") ?? "")
        _appearance = State(initialValue: identity?.appearanceNotes ?? "")
        _plating = State(initialValue: identity?.platingNotes ?? "")
        self.onConfirm = onConfirm
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("菜品身份") {
                    TextField("例如：西红柿炒鸡蛋", text: $dishName)
                    TextField("清楚可见的食材，用顿号或逗号分隔", text: $visibleIngredients, axis: .vertical)
                        .lineLimit(2...4)
                }
                Section("原照片证据") {
                    TextField("色泽、质地与烹饪状态", text: $appearance, axis: .vertical)
                        .lineLimit(2...4)
                    TextField("原菜品摆放关系", text: $plating, axis: .vertical)
                        .lineLimit(2...4)
                }
                Section {
                    Text("这里只确认原照片中看得到的内容；系统不会借此添加隐藏配料或装饰。")
                        .font(.footnote)
                        .foregroundStyle(NavaColor.secondaryInk)
                }
            }
            .navigationTitle("确认菜品")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("生成") {
                        onConfirm(NavaDishVisualIdentity(
                            canonicalDishName: dishName.trimmingCharacters(in: .whitespacesAndNewlines),
                            visibleIngredients: parsedIngredients,
                            appearanceNotes: appearance.trimmingCharacters(in: .whitespacesAndNewlines),
                            platingNotes: plating.trimmingCharacters(in: .whitespacesAndNewlines),
                            confidence: 1
                        ))
                        dismiss()
                    }
                    .disabled(dishName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private var parsedIngredients: [String] {
        visibleIngredients
            .components(separatedBy: CharacterSet(charactersIn: "、,，;；\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

private struct NavaFoodReviewSheet: View {
    @State private var result: NavaFoodRecognitionResult
    @Environment(\.dismiss) private var dismiss
    let canSave: Bool
    let onConfirm: (NavaFoodRecognitionResult) -> Void

    init(
        result: NavaFoodRecognitionResult,
        canSave: Bool,
        onConfirm: @escaping (NavaFoodRecognitionResult) -> Void
    ) {
        _result = State(initialValue: result)
        self.canSave = canSave
        self.onConfirm = onConfirm
    }

    var body: some View {
        NavigationStack {
            List {
                if let note = result.uncertaintyNote, !note.isEmpty {
                    Section("识别提醒") {
                        Label(note, systemImage: "exclamationmark.bubble")
                            .foregroundStyle(NavaColor.secondaryInk)
                    }
                }

                Section("食物与可见份量") {
                    ForEach($result.items) { $item in
                        VStack(alignment: .leading, spacing: 10) {
                            TextField("食物名称", text: $item.name)
                                .font(.headline)
                            Stepper(value: weightBinding(for: $item), in: 0...3000, step: 10) {
                                HStack {
                                    Text("可见份量")
                                    Spacer()
                                    Text("\(Int(item.visibleWeightGrams ?? 0)) g")
                                        .monospacedDigit()
                                        .foregroundStyle(NavaColor.secondaryInk)
                                }
                            }
                            HStack(spacing: 12) {
                                macro("热量", item.macros.calories, "kcal")
                                macro("蛋白", item.macros.proteinGrams, "g")
                                macro("碳水", item.macros.carbohydrateGrams, "g")
                                macro("脂肪", item.macros.fatGrams, "g")
                            }
                            if item.requiresConfirmation {
                                Label("低置信度或份量缺失，请人工确认", systemImage: "exclamationmark.triangle.fill")
                                    .font(.caption)
                                    .foregroundStyle(NavaColor.warning)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                }

                Section {
                    Text("AI 结果是估算值；保存前必须允许用户修改名称和份量，并保留模型版本与来源。")
                        .font(.footnote)
                        .foregroundStyle(NavaColor.secondaryInk)
                }
            }
            .navigationTitle("核对识别结果")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        onConfirm(result)
                        dismiss()
                    }
                    .disabled(!canSave || result.items.isEmpty)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if !canSave {
                    Text("原生账号会话与饮食记录写入接通后才能保存；当前不会假装成功。")
                        .font(.footnote)
                        .foregroundStyle(NavaColor.secondaryInk)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(.thinMaterial)
                }
            }
        }
    }

    private func weightBinding(for item: Binding<NavaFoodCandidate>) -> Binding<Double> {
        Binding(
            get: { item.wrappedValue.visibleWeightGrams ?? 0 },
            set: { item.wrappedValue.visibleWeightGrams = $0 }
        )
    }

    private func macro(_ label: String, _ value: Double?, _ unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(NavaColor.secondaryInk)
            Text(value.map { "\(Int($0.rounded())) \(unit)" } ?? "--")
                .font(.caption.weight(.semibold))
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct NavaScanReticle: View {
    let isActive: Bool
    @State private var scanPosition: CGFloat = -0.85

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                RoundedRectangle(cornerRadius: 34, style: .continuous)
                    .stroke(.white.opacity(0.9), style: StrokeStyle(lineWidth: 2, dash: [12, 8]))
                Rectangle()
                    .fill(LinearGradient(colors: [.clear, Color.green.opacity(0.9), .clear], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 2)
                    .offset(y: scanPosition * proxy.size.height / 2)
                    .shadow(color: .green.opacity(0.8), radius: 9)
                    .opacity(isActive ? 1 : 0.45)
            }
            .onAppear {
                withAnimation(.linear(duration: 1.7).repeatForever(autoreverses: true)) {
                    scanPosition = 0.85
                }
            }
        }
    }
}

private struct NavaPlateComposition: View {
    let image: CGImage
    let isComplete: Bool

    var body: some View {
        Image(decorative: image, scale: 1, orientation: .up)
            .resizable()
            .scaledToFit()
            .padding(20)
            .scaleEffect(isComplete ? 1 : 0.88)
            .opacity(isComplete ? 1 : 0.82)
            .shadow(color: NavaColor.ink.opacity(0.18), radius: 24, y: 16)
            .animation(.spring(response: 0.55, dampingFraction: 0.82), value: isComplete)
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel("AI 依据原照片重制并通过质量检查的标准盘装展示图")
    }
}

