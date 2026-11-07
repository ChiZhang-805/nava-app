import SwiftUI

struct NavaDietMeal: Identifiable, Hashable {
    let id: String
    var title: String
    var time: String
    var note: String
    var dishCount: Int
    var calories: Int
    var protein: Int
    var carbs: Int
    var fat: Int
    var imageName: String?
    var imageURL: URL?
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
    @State private var mealOverride: [NavaDietMeal]?

    private let contentState: NavaDietDashboardContentState
    private let dailyCalorieTarget: Int

    init(
        contentState: NavaDietDashboardContentState? = nil,
        date: Date? = nil,
        meals: [NavaDietMeal]? = nil,
        dailyCalorieTarget: Int = 2_000
    ) {
        self.contentState = contentState ?? .launchConfigured
        self.dailyCalorieTarget = max(dailyCalorieTarget, 1)
        _selectedDate = State(initialValue: date ?? NavaDietVisualTestClock.date)
        _mealOverride = State(initialValue: meals)
    }

    private var isChinese: Bool {
        locale.identifier.lowercased().hasPrefix("zh")
    }

    private var copy: NavaDietDashboardCopy {
        NavaDietDashboardCopy(isChinese: isChinese)
    }

    private var meals: [NavaDietMeal] {
        if let mealOverride {
            return mealOverride
        }
        if ProcessInfo.processInfo.arguments.contains("-NavaVisualTesting") {
            return NavaDietMeal.samples(isChinese: isChinese)
        }
        return []
    }

    private var displayedMeals: [NavaDietMeal] {
        contentState == .populated ? meals : []
    }

    private var totalCalories: Int {
        displayedMeals.reduce(0) { $0 + $1.calories }
    }

    private var totalDishCount: Int {
        displayedMeals.reduce(0) { $0 + $1.dishCount }
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
                calories: totalCalories,
                dishCount: totalDishCount,
                calorieTarget: dailyCalorieTarget,
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
            if meals.isEmpty {
                NavaDietInlineState(
                    icon: "fork.knife",
                    title: copy.emptyTitle,
                    message: copy.emptyMessage,
                    actionTitle: copy.addMeal
                )
            } else {
                VStack(spacing: compact ? 7 : 8) {
                    ForEach(Array(meals.enumerated()), id: \.element.id) { index, meal in
                        ZStack(alignment: .bottomTrailing) {
                            NavigationLink {
                                NavaDietMealDetailView(meals: meals, initialIndex: index)
                            } label: {
                                NavaDietMealCard(meal: meal, compact: compact)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("diet.dashboard.meal.\(meal.id)")

                            NavigationLink {
                                NavaDietMealEditorView(
                                    meal: meal,
                                    onSave: updateMeal,
                                    onDelete: deleteMeal
                                )
                            } label: {
                                NavaDietEditIcon(compact: compact)
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .ignore)
                            .padding(.trailing, compact ? 8 : 10)
                            .padding(.bottom, compact ? 8 : 11)
                            .accessibilityLabel(copy.editMeal(meal.title))
                            .accessibilityIdentifier("diet.dashboard.edit.\(meal.id)")
                        }
                        .accessibilityElement(children: .contain)
                    }
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

    private func updateMeal(_ updatedMeal: NavaDietMeal) {
        var updatedMeals = meals
        guard let index = updatedMeals.firstIndex(where: { $0.id == updatedMeal.id }) else { return }
        updatedMeals[index] = updatedMeal
        mealOverride = updatedMeals
    }

    private func deleteMeal(_ mealID: String) {
        mealOverride = meals.filter { $0.id != mealID }
    }
}

private struct NavaDietProgressHero: View {
    let calories: Int
    let dishCount: Int
    let calorieTarget: Int
    let dateText: String
    let calorieUnit: String
    let dishUnit: String
    let compact: Bool

    @ScaledMetric(relativeTo: .largeTitle) private var calorieSize: CGFloat = 44
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealedSegmentCount = 0

    private let recordedColors: [Color] = [
        Color(red: 0.57, green: 0.86, blue: 0.93),
        Color(red: 0.50, green: 0.82, blue: 0.90),
        Color(red: 0.43, green: 0.78, blue: 0.87),
        Color(red: 0.36, green: 0.73, blue: 0.84),
        Color(red: 0.29, green: 0.68, blue: 0.80),
        Color(red: 0.10, green: 0.46, blue: 0.61),
        Color(red: 0.10, green: 0.46, blue: 0.61),
        Color(red: 0.10, green: 0.46, blue: 0.61),
        Color(red: 0.10, green: 0.46, blue: 0.61)
    ]

    private var segmentFillLevels: [Double] {
        let calorieUnits = Double(max(calories, 0)) / Double(max(calorieTarget, 1))
            * Double(NavaDietGaugeGeometry.segmentCount)
        return (0..<NavaDietGaugeGeometry.segmentCount).map { index in
            min(max(calorieUnits - Double(index), 0), 1)
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            NavaDietGaugeLayout(compact: compact) {
                ForEach(0..<NavaDietGaugeGeometry.segmentCount, id: \.self) { index in
                    ZStack {
                        NavaDietGaugeSegmentShape()
                            .fill(NavaDietGaugeGeometry.unrecordedColor)

                        NavaDietGaugeSegmentShape()
                            .fill(recordedColors[index])
                            .opacity(segmentFillLevels[index])
                    }
                    .rotationEffect(.degrees(NavaDietGaugeGeometry.rotationDegrees(for: index)))
                    .opacity(index < revealedSegmentCount ? 1 : 0)
                    .scaleEffect(index < revealedSegmentCount ? 1 : 0.94)
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
        .accessibilityValue("\(revealedSegmentCount)/\(NavaDietGaugeGeometry.segmentCount)")
        .accessibilityIdentifier("diet.dashboard.gauge")
        .task(id: calories) {
            if reduceMotion {
                revealedSegmentCount = NavaDietGaugeGeometry.segmentCount
                return
            }

            revealedSegmentCount = 0
            for index in 0..<NavaDietGaugeGeometry.segmentCount {
                try? await Task.sleep(nanoseconds: 70_000_000)
                withAnimation(.easeInOut(duration: 0.30)) {
                    revealedSegmentCount = index + 1
                }
            }
        }
    }
}

private struct NavaDietMealCard: View {
    let meal: NavaDietMeal
    let compact: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize >= .xxLarge {
                accessibilityLayout
            } else {
                standardLayout
            }
        }
        .padding(compact ? 11 : 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(
            height: dynamicTypeSize >= .xxLarge ? nil : (compact ? 126 : 140),
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
        let imageSize: CGFloat = compact ? 58 : 64
        let lowerRowHeight: CGFloat = compact ? 38 : 40
        let columnWidth: CGFloat = compact ? 58 : 66

        return VStack(spacing: compact ? 8 : 10) {
            HStack(alignment: .top, spacing: compact ? 10 : 12) {
                dishImageSlot(size: imageSize)

                VStack(alignment: .leading, spacing: 3) {
                    Text(meal.title)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(NavaColor.ink)

                    Text(meal.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                         ? meal.time
                         : "\(meal.time) · \(meal.note)")
                        .font(.caption)
                        .foregroundStyle(NavaColor.secondaryInk)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)

                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(meal.calories.formatted())
                        .font(.system(size: compact ? 27 : 30, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(NavaColor.ink)

                    Text("kcal")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NavaColor.secondaryInk)
                }
                .frame(width: compact ? 84 : 94, alignment: .trailing)
            }
            .frame(height: imageSize)

            HStack(alignment: .bottom, spacing: 0) {
                HStack(spacing: 0) {
                    NavaDietMacroMini(label: "Protein", value: "\(meal.protein)g")
                        .frame(width: columnWidth, alignment: .leading)
                    NavaDietMacroMini(label: "Carbs", value: "\(meal.carbs)g")
                        .frame(width: columnWidth, alignment: .leading)
                    NavaDietMacroMini(label: "Fat", value: "\(meal.fat)g")
                        .frame(width: columnWidth, alignment: .leading)
                }

                Spacer(minLength: compact ? 42 : 48)
            }
            .frame(height: lowerRowHeight)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var accessibilityLayout: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                dishImageSlot(size: 64)
                VStack(alignment: .leading, spacing: 4) {
                    Text(meal.title)
                        .font(.headline.weight(.bold))
                    Text(meal.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                         ? meal.time
                         : "\(meal.time) · \(meal.note)")
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
                Spacer(minLength: 52)
            }
        }
        .foregroundStyle(NavaColor.ink)
    }

    private func dishImageSlot(size: CGFloat) -> some View {
        NavaDietMealArtwork(meal: meal)
            .padding(2)
            .frame(width: size, height: size)
            .shadow(color: NavaColor.ink.opacity(0.08), radius: 4, y: 2)
            .accessibilityHidden(true)
    }
}

private struct NavaDietMealArtwork: View {
    let meal: NavaDietMeal

    var body: some View {
        Group {
            if let imageURL = meal.imageURL {
                AsyncImage(url: imageURL, transaction: Transaction(animation: .easeInOut(duration: 0.25))) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .empty:
                        placeholder(showsProgress: true)
                    case .failure:
                        placeholder(showsProgress: false)
                    @unknown default:
                        placeholder(showsProgress: false)
                    }
                }
            } else if let imageName = meal.imageName, !imageName.isEmpty {
                Image(imageName)
                    .resizable()
                    .scaledToFit()
            } else {
                placeholder(showsProgress: false)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func placeholder(showsProgress: Bool) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(NavaColor.mist.opacity(0.72))

            if showsProgress {
                ProgressView()
                    .tint(NavaColor.secondaryInk)
            } else {
                Image(systemName: "fork.knife")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(NavaColor.secondaryInk.opacity(0.68))
            }
        }
    }
}

private struct NavaDietEditIcon: View {
    let compact: Bool

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Image(systemName: "pencil")
                .font(.system(size: compact ? 19 : 21, weight: .black))
                .symbolRenderingMode(.monochrome)
                .offset(x: -2, y: -3)

            Capsule()
                .frame(width: compact ? 8 : 10, height: 2.5)
        }
        .foregroundStyle(NavaColor.ink)
        .frame(width: compact ? 25 : 28, height: compact ? 25 : 28)
        .accessibilityHidden(true)
    }
}

private struct NavaDietMacroMini: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NavaColor.secondaryInk)
            Text(value)
                .font(.callout.weight(.bold))
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

    func editMeal(_ title: String) -> String {
        isChinese ? "编辑\(title)" : "Edit \(title)"
    }

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
            width: min(max(width * 0.16, 50), 56),
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
                        NavaDietMealArtwork(meal: meal)
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

private enum NavaDietMealKind: String, CaseIterable, Identifiable {
    case breakfast
    case lunch
    case dinner
    case snack

    var id: Self { self }

    func title(isChinese: Bool) -> String {
        switch self {
        case .breakfast: isChinese ? "早餐" : "Breakfast"
        case .lunch: isChinese ? "午餐" : "Lunch"
        case .dinner: isChinese ? "晚餐" : "Dinner"
        case .snack: isChinese ? "加餐" : "Snack"
        }
    }

    static func infer(from meal: NavaDietMeal) -> Self {
        let source = "\(meal.id) \(meal.title)".lowercased()
        if source.contains("breakfast") || source.contains("早餐") { return .breakfast }
        if source.contains("dinner") || source.contains("晚餐") { return .dinner }
        if source.contains("snack") || source.contains("加餐") { return .snack }
        return .lunch
    }
}

private struct NavaDietMealEditorView: View {
    @State private var draft: NavaDietMeal
    @State private var mealKind: NavaDietMealKind
    @State private var showingDeleteConfirmation = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale

    let onSave: (NavaDietMeal) -> Void
    let onDelete: (String) -> Void

    init(
        meal: NavaDietMeal,
        onSave: @escaping (NavaDietMeal) -> Void,
        onDelete: @escaping (String) -> Void
    ) {
        _draft = State(initialValue: meal)
        _mealKind = State(initialValue: NavaDietMealKind.infer(from: meal))
        self.onSave = onSave
        self.onDelete = onDelete
    }

    private var isChinese: Bool {
        locale.identifier.lowercased().hasPrefix("zh")
    }

    private var selectedMealTitle: String {
        mealKind.title(isChinese: isChinese)
    }

    var body: some View {
        ZStack {
            NavaDietDashboardBackground()

            ScrollView {
                LazyVStack(spacing: 16) {
                    mealKindPicker
                    mealDetailsCard
                    recognitionCard
                    deleteButton
                }
                .padding(.horizontal, NavaMetric.pageInset)
                .padding(.top, 12)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollIndicators(.hidden)
        }
        .navigationTitle(isChinese ? "编辑\(selectedMealTitle)" : "Edit \(selectedMealTitle)")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(false)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    draft.title = selectedMealTitle
                    onSave(draft)
                    dismiss()
                } label: {
                    Image(systemName: "checkmark")
                        .fontWeight(.bold)
                }
                .accessibilityLabel(isChinese ? "保存餐食修改" : "Save meal changes")
            }
        }
        .confirmationDialog(
            isChinese ? "删除\(selectedMealTitle)？" : "Delete \(selectedMealTitle)?",
            isPresented: $showingDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button(isChinese ? "删除记录" : "Delete Meal", role: .destructive) {
                onDelete(draft.id)
                dismiss()
            }
            Button(isChinese ? "取消" : "Cancel", role: .cancel) { }
        } message: {
            Text(isChinese
                ? "删除后，这条记录的热量与菜品数量也会从当天汇总中移除。"
                : "Its calories and dish count will also be removed from today's totals."
            )
        }
        .accessibilityIdentifier("diet.meal.editor")
    }

    private var mealKindPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(isChinese ? "选择餐次" : "Meal")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NavaColor.secondaryInk)

            Picker(isChinese ? "选择餐次" : "Select meal", selection: $mealKind) {
                ForEach(NavaDietMealKind.allCases) { kind in
                    Text(kind.title(isChinese: isChinese)).tag(kind)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("diet.meal.editor.kind")
        }
        .padding(16)
        .background(Color.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var mealDetailsCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 14) {
                NavaDietMealArtwork(meal: draft)
                    .frame(width: 88, height: 88)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 8) {
                    Text(selectedMealTitle)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(NavaColor.ink)

                    TextField(
                        isChinese ? "这一餐吃了什么" : "What did you eat?",
                        text: $draft.note,
                        axis: .vertical
                    )
                    .font(.subheadline)
                    .foregroundStyle(NavaColor.ink)
                    .lineLimit(2...3)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(NavaColor.mist.opacity(0.58), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }

            HStack(spacing: 12) {
                NavaDietMealTextControl(
                    title: isChinese ? "记录时间" : "Time",
                    systemImage: "clock",
                    text: $draft.time
                )
                .keyboardType(.numbersAndPunctuation)

                NavaDietMealCountControl(
                    title: isChinese ? "菜品数量" : "Dishes",
                    value: $draft.dishCount,
                    range: 1...20,
                    unit: isChinese ? "道" : ""
                )
            }

            VStack(alignment: .leading, spacing: 12) {
                Text(isChinese ? "营养估算" : "Nutrition")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(NavaColor.ink)

                LazyVGrid(
                    columns: [
                        GridItem(.flexible(), spacing: 12),
                        GridItem(.flexible(), spacing: 12)
                    ],
                    spacing: 12
                ) {
                    NavaDietEditableMetric(
                        title: isChinese ? "热量" : "Calories",
                        unit: "kcal",
                        systemImage: "flame.fill",
                        tint: NavaColor.reward,
                        value: $draft.calories,
                        range: 0...5000,
                        step: 10
                    )
                    NavaDietEditableMetric(
                        title: "Protein",
                        unit: "g",
                        systemImage: "leaf.fill",
                        tint: NavaColor.accent,
                        value: $draft.protein,
                        range: 0...300
                    )
                    NavaDietEditableMetric(
                        title: "Carbs",
                        unit: "g",
                        systemImage: "circle.hexagongrid.fill",
                        tint: Color(red: 0.33, green: 0.68, blue: 0.78),
                        value: $draft.carbs,
                        range: 0...500
                    )
                    NavaDietEditableMetric(
                        title: "Fat",
                        unit: "g",
                        systemImage: "drop.fill",
                        tint: Color(red: 0.23, green: 0.48, blue: 0.62),
                        value: $draft.fat,
                        range: 0...300
                    )
                }
            }
        }
        .padding(18)
        .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: NavaColor.ink.opacity(0.05), radius: 18, y: 8)
    }

    private var recognitionCard: some View {
        NavigationLink {
            NavaFoodScanView { result, asset in
                applyRecognition(result, asset: asset)
            }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "camera.viewfinder")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(NavaColor.accent)
                    .frame(width: 48, height: 48)
                    .background(NavaColor.mist, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(isChinese ? "重新拍摄并识别" : "Scan This Meal Again")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NavaColor.ink)
                    Text(isChinese ? "自动更新菜品、数量与营养估算" : "Update foods, portions, and nutrition")
                        .font(.caption)
                        .foregroundStyle(NavaColor.secondaryInk)
                }

                Spacer(minLength: 4)

                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NavaColor.secondaryInk.opacity(0.72))
            }
            .padding(16)
            .background(Color.white.opacity(0.80), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("diet.meal.editor.rescan")
    }

    private var deleteButton: some View {
        Button(role: .destructive) {
            showingDeleteConfirmation = true
        } label: {
            Label(
                isChinese ? "删除这条餐食记录" : "Delete This Meal",
                systemImage: "trash"
            )
            .font(.subheadline.weight(.semibold))
            .frame(minHeight: NavaMetric.minimumTap)
        }
    }

    private func applyRecognition(_ result: NavaFoodRecognitionResult, asset: NavaGeneratedDishAsset?) {
        let names = result.items
            .map(\.name)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let macros = result.items.map(\.macros)

        draft.dishCount = max(names.count, 1)
        if !names.isEmpty {
            draft.note = names.prefix(3).joined(separator: "、")
        }
        if let calories = roundedTotal(macros.compactMap(\.calories)) {
            draft.calories = calories
        }
        if let protein = roundedTotal(macros.compactMap(\.proteinGrams)) {
            draft.protein = protein
        }
        if let carbs = roundedTotal(macros.compactMap(\.carbohydrateGrams)) {
            draft.carbs = carbs
        }
        if let fat = roundedTotal(macros.compactMap(\.fatGrams)) {
            draft.fat = fat
        }

        if let storagePath = asset?.storagePath,
           let url = URL(string: storagePath),
           url.scheme == "https" || url.scheme == "http" {
            draft.imageURL = url
            draft.imageName = nil
        }
    }

    private func roundedTotal(_ values: [Double]) -> Int? {
        guard !values.isEmpty else { return nil }
        return Int(values.reduce(0, +).rounded())
    }
}

private struct NavaDietMealTextControl: View {
    let title: String
    let systemImage: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NavaColor.secondaryInk)

            TextField("--:--", text: $text)
                .font(.headline.monospacedDigit())
                .foregroundStyle(NavaColor.ink)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
        .background(NavaColor.mist.opacity(0.52), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct NavaDietMealCountControl: View {
    let title: String
    @Binding var value: Int
    let range: ClosedRange<Int>
    let unit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(unit.isEmpty ? title : "\(title) · \(unit)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(NavaColor.secondaryInk)
                .lineLimit(1)

            HStack(spacing: 4) {
                NavaDietAdjustmentButton(systemImage: "minus") {
                    value = max(range.lowerBound, value - 1)
                }
                .disabled(value <= range.lowerBound)

                Text("\(value)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(NavaColor.ink)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)

                NavaDietAdjustmentButton(systemImage: "plus") {
                    value = min(range.upperBound, value + 1)
                }
                .disabled(value >= range.upperBound)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
        .background(NavaColor.mist.opacity(0.52), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct NavaDietEditableMetric: View {
    let title: String
    let unit: String
    let systemImage: String
    let tint: Color
    @Binding var value: Int
    let range: ClosedRange<Int>
    var step = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                Image(systemName: systemImage)
                    .foregroundStyle(tint)
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NavaColor.secondaryInk)
                    .lineLimit(1)
            }

            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(value)")
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(NavaColor.ink)
                Text(unit)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(NavaColor.secondaryInk)
            }

            HStack(spacing: 10) {
                NavaDietAdjustmentButton(systemImage: "minus") {
                    value = max(range.lowerBound, value - step)
                }
                .disabled(value <= range.lowerBound)

                NavaDietAdjustmentButton(systemImage: "plus") {
                    value = min(range.upperBound, value + step)
                }
                .disabled(value >= range.upperBound)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .leading)
        .background(tint.opacity(0.09), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(title), \(value) \(unit)")
    }
}

private struct NavaDietAdjustmentButton: View {
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(NavaColor.ink)
                .frame(width: NavaMetric.minimumTap, height: NavaMetric.minimumTap)
                .background(Color.white.opacity(0.86), in: Circle())
        }
        .buttonStyle(.plain)
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
            dishCount: 2,
            calories: 684,
            protein: 32,
            carbs: 58,
            fat: 21,
            imageName: "NavaFoodTomatoEggs",
            imageURL: nil
        ),
        NavaDietMeal(
            id: "breakfast",
            title: isChinese ? "早餐" : "Breakfast",
            time: "08:10",
            note: isChinese ? "鸡胸时蔬" : "Chicken and vegetables",
            dishCount: 1,
            calories: 602,
            protein: 46,
            carbs: 41,
            fat: 12,
            imageName: "NavaFoodChickenRice",
            imageURL: nil
        )
    ] }
}

#if DEBUG
struct NavaDietDashboardView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            NavaDietDashboardView(meals: NavaDietMeal.samples(isChinese: true))
        }
        .previewDisplayName("饮食记录 · iPhone 15 Pro")

        NavigationStack {
            NavaDietDashboardView(meals: NavaDietMeal.samples(isChinese: true))
        }
        .previewDevice("iPhone SE (3rd generation)")
        .previewDisplayName("饮食记录 · Compact")
    }
}
#endif
