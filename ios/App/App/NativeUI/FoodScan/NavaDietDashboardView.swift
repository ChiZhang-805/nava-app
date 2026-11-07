import SwiftUI

struct NavaDietMeal: Identifiable, Hashable {
    let id: String
    let title: String
    let time: String
    let note: String
    let calories: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    let imageName: String
}

enum NavaDietDashboardContentState: String {
    case populated
    case empty
    case failure

    fileprivate static var launchConfigured: Self {
        guard ProcessInfo.processInfo.arguments.contains("-NavaVisualTesting"),
              let rawValue = ProcessInfo.processInfo.environment["NAVA_DIET_VISUAL_STATE"],
              let state = Self(rawValue: rawValue) else {
            return .populated
        }
        return state
    }
}

private enum NavaDietVisualTestClock {
    static var date: Date {
        guard ProcessInfo.processInfo.arguments.contains("-NavaVisualTesting"),
              let rawValue = ProcessInfo.processInfo.environment["NAVA_VISUAL_FIXED_DATE"] else {
            return Date()
        }
        return ISO8601DateFormatter().date(from: rawValue) ?? Date()
    }
}

struct NavaDietDashboardView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.locale) private var locale
    @State private var selectedDate: Date

    private let contentState: NavaDietDashboardContentState

    init(
        contentState: NavaDietDashboardContentState? = nil,
        date: Date? = nil
    ) {
        self.contentState = contentState ?? .launchConfigured
        _selectedDate = State(initialValue: date ?? NavaDietVisualTestClock.date)
    }

    private var isChinese: Bool {
        locale.identifier.lowercased().hasPrefix("zh")
    }

    private var copy: NavaDietDashboardCopy {
        NavaDietDashboardCopy(isChinese: isChinese)
    }

    private var meals: [NavaDietMeal] {
        NavaDietMeal.samples(isChinese: isChinese)
    }

    var body: some View {
        GeometryReader { proxy in
            let compact = proxy.size.height < 690
            let requiresScrolling = compact || dynamicTypeSize >= .xxLarge

            ZStack {
                NavaDietDashboardBackground()

                if requiresScrolling {
                    ScrollView {
                        dashboardContent(compact: compact)
                            .padding(.bottom, 18)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .scrollIndicators(.hidden)
                } else {
                    dashboardContent(compact: false)
                        .frame(maxHeight: .infinity, alignment: .top)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("diet.dashboard")
        .navigationBarBackButtonHidden(true)
        .navigationBarHidden(true)
    }

    @ViewBuilder
    private func dashboardContent(compact: Bool) -> some View {
        VStack(spacing: 0) {
            NavaDietDashboardHeader(
                title: copy.title,
                backTitle: copy.back,
                todayTitle: copy.today,
                dateText: copy.dateText(selectedDate, locale: locale),
                backAction: { dismiss() },
                todayAction: { selectedDate = Date() }
            )
            .frame(height: compact ? 54 : 58)

            NavaDietProgressHero(
                calories: 1_286,
                dishCount: 3,
                dateText: copy.dateText(selectedDate, locale: locale),
                calorieUnit: copy.calorieUnit,
                dishUnit: copy.dishUnit,
                compact: compact
            )
            .padding(.top, compact ? 2 : 12)

            NavigationLink(value: NavaRoute.foodScan) {
                Label(copy.addMeal, systemImage: "plus")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(NavaColor.ink)
                    .frame(maxWidth: .infinity, minHeight: compact ? 46 : 50)
                    .background(NavaColor.mist.opacity(0.86), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(NavaColor.accent.opacity(0.12), lineWidth: 1)
                    }
            }
            .buttonStyle(.plain)
            .padding(.top, compact ? 8 : 18)
            .accessibilityIdentifier("diet.dashboard.add-meal")

            mealRegion(compact: compact)
                .padding(.top, compact ? 8 : 10)
        }
        .padding(.horizontal, compact ? 16 : 20)
    }

    @ViewBuilder
    private func mealRegion(compact: Bool) -> some View {
        switch contentState {
        case .populated:
            VStack(spacing: compact ? 7 : 8) {
                ForEach(Array(meals.enumerated()), id: \.element.id) { index, meal in
                    NavigationLink {
                        NavaDietMealDetailView(meals: meals, initialIndex: index)
                    } label: {
                        NavaDietMealCard(meal: meal, compact: compact)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("diet.dashboard.meal.\(meal.id)")
                }
            }
        case .empty:
            NavaDietInlineState(
                icon: "fork.knife",
                title: copy.emptyTitle,
                message: copy.emptyMessage,
                actionTitle: copy.addMeal
            )
        case .failure:
            NavaDietInlineState(
                icon: "wifi.exclamationmark",
                title: copy.failureTitle,
                message: copy.failureMessage,
                actionTitle: copy.retry
            )
        }
    }
}

private struct NavaDietProgressHero: View {
    let calories: Int
    let dishCount: Int
    let dateText: String
    let calorieUnit: String
    let dishUnit: String
    let compact: Bool

    @ScaledMetric(relativeTo: .largeTitle) private var calorieSize: CGFloat = 44

    private let recordedSegmentCount = 6
    private let recordedColors: [Color] = [
        Color(red: 0.57, green: 0.86, blue: 0.93),
        Color(red: 0.50, green: 0.82, blue: 0.90),
        Color(red: 0.43, green: 0.78, blue: 0.87),
        Color(red: 0.36, green: 0.73, blue: 0.84),
        Color(red: 0.29, green: 0.68, blue: 0.80),
        Color(red: 0.10, green: 0.46, blue: 0.61)
    ]

    var body: some View {
        ZStack(alignment: .bottom) {
            NavaDietGaugeLayout(compact: compact) {
                ForEach(0..<NavaDietGaugeGeometry.segmentCount, id: \.self) { index in
                    NavaDietGaugeSegmentShape()
                        .fill(index < recordedSegmentCount ? recordedColors[index] : NavaDietGaugeGeometry.unrecordedColor)
                        .rotationEffect(.degrees(NavaDietGaugeGeometry.rotationDegrees(for: index)))
                        .accessibilityHidden(true)
                }
            }

            VStack(spacing: compact ? 1 : 2) {
                Text(dateText)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(NavaColor.secondaryInk)
                Text(calories.formatted())
                    .font(.system(size: min(calorieSize, compact ? 42 : 52), weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(NavaColor.ink)
                Text("\(calorieUnit) · \(dishCount) \(dishUnit)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(NavaColor.secondaryInk)
            }
            .padding(.bottom, compact ? 8 : 10)
        }
        .frame(maxWidth: .infinity)
        .frame(height: compact ? 204 : 228)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(dateText)，\(calories) \(calorieUnit)，\(dishCount) \(dishUnit)")
        .accessibilityIdentifier("diet.dashboard.gauge")
    }
}

private struct NavaDietMealCard: View {
    let meal: NavaDietMeal
    let compact: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                accessibilityLayout
            } else {
                standardLayout
            }
        }
        .padding(compact ? 11 : 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(
            height: dynamicTypeSize.isAccessibilitySize ? nil : (compact ? 126 : 140),
            alignment: .leading
        )
        .clipped()
        .background(Color.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.96), lineWidth: 1)
        }
        .shadow(color: NavaColor.ink.opacity(0.035), radius: 12, y: 5)
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var standardLayout: some View {
        ZStack(alignment: .topLeading) {
            Image(meal.imageName)
                .resizable()
                .scaledToFit()
                .frame(width: compact ? 58 : 64, height: compact ? 58 : 64)
                .background(Color.white, in: Circle())
                .clipShape(Circle())
                .shadow(color: NavaColor.ink.opacity(0.10), radius: 5, y: 2)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(meal.title)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(NavaColor.ink)

                Text("\(meal.time) · \(meal.note)")
                    .font(.caption)
                    .foregroundStyle(NavaColor.secondaryInk)
                    .lineLimit(2)
            }
            .padding(.leading, compact ? 68 : 72)
            .padding(.trailing, compact ? 68 : 74)
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .trailing, spacing: 0) {
                Text(meal.calories.formatted())
                    .font(.system(size: compact ? 27 : 30, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(NavaColor.ink)
                Text("kcal")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(NavaColor.secondaryInk)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)

            HStack(spacing: compact ? 8 : 12) {
                NavaDietMacroMini(label: "Protein", value: "\(meal.protein)g")
                NavaDietMacroMini(label: "Carbs", value: "\(meal.carbs)g")
                NavaDietMacroMini(label: "Fat", value: "\(meal.fat)g")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)

            Image(systemName: "pencil")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NavaColor.ink)
                .frame(width: 32, height: 32)
                .background(NavaColor.mist, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var accessibilityLayout: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(meal.imageName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 64, height: 64)
                    .background(Color.white, in: Circle())
                    .clipShape(Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(meal.title)
                        .font(.headline.weight(.bold))
                    Text("\(meal.time) · \(meal.note)")
                        .font(.body)
                        .foregroundStyle(NavaColor.secondaryInk)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(meal.calories.formatted())
                        .font(.title2.weight(.bold))
                        .monospacedDigit()
                    Text("kcal")
                        .font(.caption)
                        .foregroundStyle(NavaColor.secondaryInk)
                }
            }
            HStack(spacing: 20) {
                NavaDietMacroMini(label: "Protein", value: "\(meal.protein)g")
                NavaDietMacroMini(label: "Carbs", value: "\(meal.carbs)g")
                NavaDietMacroMini(label: "Fat", value: "\(meal.fat)g")
                Spacer(minLength: 0)
                Image(systemName: "pencil")
                    .font(.headline)
                    .frame(width: 44, height: 44)
                    .background(NavaColor.mist, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .foregroundStyle(NavaColor.ink)
    }
}

private struct NavaDietMacroMini: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundStyle(NavaColor.secondaryInk)
            Text(value)
                .font(.caption.weight(.bold))
                .foregroundStyle(NavaColor.ink)
        }
    }
}

private struct NavaDietDashboardCopy {
    let isChinese: Bool

    var title: String { isChinese ? "饮食记录" : "Diet" }
    var back: String { isChinese ? "返回" : "Back" }
    var today: String { isChinese ? "回到今天" : "Back to Today" }
    var addMeal: String { isChinese ? "拍照添加一餐" : "Add a Meal by Photo" }
    var calorieUnit: String { isChinese ? "千卡" : "kcal" }
    var dishUnit: String { isChinese ? "道菜" : "dishes" }
    var emptyTitle: String { isChinese ? "今天还没有餐食" : "No meals yet today" }
    var emptyMessage: String { isChinese ? "拍下第一餐，确认后再写入记录。" : "Photograph a meal and confirm it before saving." }
    var failureTitle: String { isChinese ? "暂时无法读取餐食" : "Meals are unavailable" }
    var failureMessage: String { isChinese ? "记录没有丢失，请稍后重试。" : "Your records are safe. Try again in a moment." }
    var retry: String { isChinese ? "重试" : "Retry" }

    func dateText(_ date: Date, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = isChinese ? "M 月 d 日 · EEEE" : "EEE, MMM d"
        return formatter.string(from: date)
    }
}

private struct NavaDietDashboardHeader: View {
    let title: String
    let backTitle: String
    let todayTitle: String
    let dateText: String
    let backAction: () -> Void
    let todayAction: () -> Void

    var body: some View {
        ZStack {
            Text(title)
                .font(.headline.weight(.semibold))
                .foregroundStyle(NavaColor.ink)

            HStack {
                Button(action: backAction) {
                    Image(systemName: "chevron.left")
                        .font(.headline.weight(.semibold))
                        .frame(width: 52, height: 52)
                        .background(Color.white.opacity(0.90), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                }
                .accessibilityLabel(backTitle)

                Spacer()

                Menu {
                    Text(dateText)
                    Button(todayTitle, action: todayAction)
                } label: {
                    Image(systemName: "calendar")
                        .font(.headline.weight(.semibold))
                        .frame(width: 52, height: 52)
                        .background(Color.white.opacity(0.90), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                }
                .accessibilityLabel(dateText)
            }
            .foregroundStyle(NavaColor.ink)
        }
    }
}

private struct NavaDietDashboardBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.973, green: 0.965, blue: 0.945),
                Color(red: 0.944, green: 0.980, blue: 0.985)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

private enum NavaDietGaugeGeometry {
    static let segmentCount = 9
    static let startAngleDegrees = 176.0
    static let endAngleDegrees = 4.0
    static let angularStepDegrees = abs(endAngleDegrees - startAngleDegrees) / Double(segmentCount - 1)
    static let unrecordedColor = Color(red: 0.88, green: 0.89, blue: 0.86)

    static func angleDegrees(for index: Int) -> Double {
        let progress = Double(index) / Double(segmentCount - 1)
        return startAngleDegrees + (endAngleDegrees - startAngleDegrees) * progress
    }

    static func rotationDegrees(for index: Int) -> Double {
        90 - angleDegrees(for: index)
    }
}

private struct NavaDietGaugeLayout: Layout {
    let compact: Bool

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let width = proposal.width ?? 350
        return CGSize(width: width, height: compact ? 204 : 228)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let width = bounds.width
        let segmentSize = CGSize(
            width: min(max(width * 0.154, 48), 54),
            height: min(max(width * 0.183, 58), 64)
        )
        let center = CGPoint(x: bounds.midX, y: bounds.minY + (compact ? 174 : 194))
        let radiusX = min(width * 0.409, 143)
        let radiusY: CGFloat = compact ? 142 : 156

        for (index, subview) in subviews.enumerated() {
            let angle = NavaDietGaugeGeometry.angleDegrees(for: index) * .pi / 180
            let point = CGPoint(
                x: center.x + CGFloat(cos(angle)) * radiusX,
                y: center.y - CGFloat(sin(angle)) * radiusY
            )
            subview.place(
                at: point,
                anchor: .center,
                proposal: ProposedViewSize(width: segmentSize.width, height: segmentSize.height)
            )
        }
    }
}

private struct NavaDietGaugeSegmentShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height
        let cornerFraction: CGFloat = 0.08
        let straightSideHeight = (1 - 2 * cornerFraction) * h
        // Each package rotates by 21.5°. A half-step side angle makes the two
        // edges facing across every gap exactly parallel after rotation.
        let halfStepRadians = NavaDietGaugeGeometry.angularStepDegrees * .pi / 360
        let sideRun = straightSideHeight * CGFloat(tan(halfStepRadians))
        let outerLeft = 0.02 * w
        let outerRight = 0.98 * w
        let innerLeft = outerLeft + sideRun
        let innerRight = outerRight - sideRun
        var path = Path()
        path.move(to: CGPoint(x: 0.10 * w, y: 0))
        path.addLine(to: CGPoint(x: 0.90 * w, y: 0))
        path.addQuadCurve(
            to: CGPoint(x: outerRight, y: cornerFraction * h),
            control: CGPoint(x: outerRight, y: 0)
        )
        path.addLine(to: CGPoint(x: innerRight, y: (1 - cornerFraction) * h))
        path.addQuadCurve(
            to: CGPoint(x: 0.72 * w, y: h),
            control: CGPoint(x: innerRight - 0.02 * w, y: h)
        )
        path.addLine(to: CGPoint(x: 0.28 * w, y: h))
        path.addQuadCurve(
            to: CGPoint(x: innerLeft, y: (1 - cornerFraction) * h),
            control: CGPoint(x: innerLeft + 0.02 * w, y: h)
        )
        path.addLine(to: CGPoint(x: outerLeft, y: cornerFraction * h))
        path.addQuadCurve(
            to: CGPoint(x: 0.10 * w, y: 0),
            control: CGPoint(x: outerLeft, y: 0)
        )
        path.closeSubpath()
        return path
    }
}

private struct NavaDietInlineState: View {
    let icon: String
    let title: String
    let message: String
    let actionTitle: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(NavaColor.accent)
            Text(title)
                .font(.headline.weight(.bold))
                .foregroundStyle(NavaColor.ink)
            Text(message)
                .font(.body)
                .foregroundStyle(NavaColor.secondaryInk)
                .multilineTextAlignment(.center)
            Text(actionTitle)
                .font(.headline.weight(.semibold))
                .foregroundStyle(NavaColor.accent)
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .padding(.horizontal, 20)
        .background(Color.white.opacity(0.74), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct NavaDietMealDetailView: View {
    let meals: [NavaDietMeal]
    @State private var selectedIndex: Int
    @State private var protein: Int
    @State private var carbs: Int
    @State private var fat: Int
    @State private var showingEditor = false
    @Environment(\.dismiss) private var dismiss

    init(meals: [NavaDietMeal], initialIndex: Int) {
        self.meals = meals
        let safeIndex = min(max(initialIndex, 0), max(meals.count - 1, 0))
        _selectedIndex = State(initialValue: safeIndex)
        let meal = meals[safeIndex]
        _protein = State(initialValue: meal.protein)
        _carbs = State(initialValue: meal.carbs)
        _fat = State(initialValue: meal.fat)
    }

    private var selectedMeal: NavaDietMeal { meals[selectedIndex] }

    var body: some View {
        NavaScrollPage {
            VStack(spacing: 18) {
                NavaPageHeader(
                    title: LocalizedStringKey(selectedMeal.title),
                    backAction: { dismiss() },
                    menuAction: { showingEditor = true }
                )

                TabView(selection: $selectedIndex) {
                    ForEach(Array(meals.enumerated()), id: \.element.id) { index, meal in
                        Image(meal.imageName)
                            .resizable()
                            .scaledToFit()
                            .padding(.horizontal, 10)
                            .tag(index)
                            .accessibilityLabel(meal.title)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .frame(height: 290)

                VStack(spacing: 4) {
                    Text(selectedMeal.title)
                        .font(.largeTitle.weight(.bold))
                        .foregroundStyle(NavaColor.ink)
                    Text("左右滑动切换本餐菜品")
                        .font(.subheadline)
                        .foregroundStyle(NavaColor.secondaryInk)
                }

                HStack(spacing: 0) {
                    NavaDietMacroValue(value: protein, label: "Protein")
                    Divider().overlay(NavaColor.divider)
                    NavaDietMacroValue(value: carbs, label: "Carbs")
                    Divider().overlay(NavaColor.divider)
                    NavaDietMacroValue(value: fat, label: "Fat")
                }
                .frame(minHeight: 84)
                .background(Color.white.opacity(0.84), in: RoundedRectangle(cornerRadius: 26, style: .continuous))

                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("本餐热量")
                            .font(.subheadline)
                            .foregroundStyle(NavaColor.secondaryInk)
                        Text("\(selectedMeal.calories) kcal")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(NavaColor.ink)
                    }
                    Spacer()
                    Button("编辑营养") { showingEditor = true }
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22)
                        .frame(minHeight: 48)
                        .background(NavaColor.ink, in: Capsule())
                }
                .padding(18)
                .background(Color.white.opacity(0.80), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .tabBar)
        .onChange(of: selectedIndex) { newIndex in
            let meal = meals[newIndex]
            protein = meal.protein
            carbs = meal.carbs
            fat = meal.fat
        }
        .sheet(isPresented: $showingEditor) {
            NavaDietNutritionEditor(protein: $protein, carbs: $carbs, fat: $fat)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }
}

private struct NavaDietMacroValue: View {
    let value: Int
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)g")
                .font(.title3.weight(.bold))
                .foregroundStyle(NavaColor.ink)
            Text(label)
                .font(.caption)
                .foregroundStyle(NavaColor.secondaryInk)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct NavaDietNutritionEditor: View {
    @Binding var protein: Int
    @Binding var carbs: Int
    @Binding var fat: Int
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("营养含量") {
                    Stepper("Protein  \(protein)g", value: $protein, in: 0...300)
                    Stepper("Carbs  \(carbs)g", value: $carbs, in: 0...500)
                    Stepper("Fat  \(fat)g", value: $fat, in: 0...300)
                }
                Section {
                    Text("识别结果可以人工校正；保存后再写回当前餐食记录。")
                        .font(.footnote)
                        .foregroundStyle(NavaColor.secondaryInk)
                }
            }
            .navigationTitle("编辑营养")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                }
            }
        }
    }
}

private extension NavaDietMeal {
    static func samples(isChinese: Bool) -> [NavaDietMeal] { [
        NavaDietMeal(
            id: "lunch",
            title: isChinese ? "午餐" : "Lunch",
            time: "12:36",
            note: isChinese ? "番茄炒蛋等 2 道" : "Tomato eggs + 1 dish",
            calories: 684,
            protein: 32,
            carbs: 58,
            fat: 21,
            imageName: "NavaFoodTomatoEggs"
        ),
        NavaDietMeal(
            id: "breakfast",
            title: isChinese ? "早餐" : "Breakfast",
            time: "08:10",
            note: isChinese ? "鸡胸时蔬" : "Chicken and vegetables",
            calories: 602,
            protein: 46,
            carbs: 41,
            fat: 12,
            imageName: "NavaFoodChickenRice"
        )
    ] }
}

#if DEBUG
struct NavaDietDashboardView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            NavaDietDashboardView()
        }
        .previewDisplayName("饮食记录 · iPhone 15 Pro")

        NavigationStack {
            NavaDietDashboardView()
        }
        .previewDevice("iPhone SE (3rd generation)")
        .previewDisplayName("饮食记录 · Compact")
    }
}
#endif
