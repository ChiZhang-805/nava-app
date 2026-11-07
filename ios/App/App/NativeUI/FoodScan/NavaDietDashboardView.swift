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
                                    recentMeals: meals,
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

private enum NavaDietFoodSource: String {
    case current
    case recent
    case common

    func title(isChinese: Bool) -> String {
        switch self {
        case .current: isChinese ? "本餐原记录" : "Current meal"
        case .recent: isChinese ? "最近吃过" : "Recently eaten"
        case .common: isChinese ? "常见菜品" : "Common food"
        }
    }

    var systemImage: String {
        switch self {
        case .current: "checkmark.seal.fill"
        case .recent: "clock.arrow.circlepath"
        case .common: "sparkles"
        }
    }
}

private enum NavaDietFoodScope: String, CaseIterable, Identifiable {
    case all
    case recent
    case favorites
    case common

    var id: Self { self }

    func title(isChinese: Bool) -> String {
        switch self {
        case .all: isChinese ? "全部" : "All"
        case .recent: isChinese ? "最近" : "Recent"
        case .favorites: isChinese ? "收藏" : "Favorites"
        case .common: isChinese ? "常见" : "Common"
        }
    }
}

private struct NavaDietFoodOption: Identifiable {
    let id: String
    let name: String
    let source: NavaDietFoodSource
    let meal: NavaDietMeal
    let searchTerms: [String]

    var dishCount: Int { meal.dishCount }
    var calories: Int { meal.calories }
    var protein: Int { meal.protein }
    var carbs: Int { meal.carbs }
    var fat: Int { meal.fat }
}

private struct NavaDietMealEditorView: View {
    private static let existingFoodIDPrefix = "existing-"

    @State private var draft: NavaDietMeal
    @State private var query = ""
    @State private var scope: NavaDietFoodScope = .all
    @State private var selectedFoodIDs: Set<String>
    @State private var showingDeleteConfirmation = false
    @AppStorage("nava.diet.favoriteFoodIDs") private var favoriteFoodIDsRaw = ""
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dismissSearch) private var dismissSearch
    @Environment(\.locale) private var locale

    private let recentMeals: [NavaDietMeal]
    let onSave: (NavaDietMeal) -> Void
    let onDelete: (String) -> Void

    init(
        meal: NavaDietMeal,
        recentMeals: [NavaDietMeal] = [],
        onSave: @escaping (NavaDietMeal) -> Void,
        onDelete: @escaping (String) -> Void
    ) {
        _draft = State(initialValue: meal)
        _selectedFoodIDs = State(initialValue: [Self.existingFoodIDPrefix + meal.id])
        self.recentMeals = recentMeals
        self.onSave = onSave
        self.onDelete = onDelete
    }

    private var isChinese: Bool {
        locale.identifier.lowercased().hasPrefix("zh")
    }

    private var existingFoodID: String {
        Self.existingFoodIDPrefix + draft.id
    }

    private var favoriteFoodIDs: Set<String> {
        Set(favoriteFoodIDsRaw.split(separator: ",").map(String.init))
    }

    private var foodOptions: [NavaDietFoodOption] {
        var options = [existingFoodOption]
        var representedImages = Set([draft.imageName].compactMap { $0 })

        for meal in recentMeals where meal.id != draft.id {
            if let imageName = meal.imageName, representedImages.contains(imageName) {
                continue
            }
            representedImages.formUnion([meal.imageName].compactMap { $0 })
            options.append(
                NavaDietFoodOption(
                    id: "recent-\(meal.id)",
                    name: primaryFoodName(from: meal),
                    source: .recent,
                    meal: meal,
                    searchTerms: [meal.title, meal.note]
                )
            )
        }

        for option in commonFoodOptions where !representedImages.contains(option.meal.imageName ?? "") {
            options.append(option)
        }
        return options
    }

    private var visibleFoodOptions: [NavaDietFoodOption] {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let base: [NavaDietFoodOption]

        if normalizedQuery.isEmpty {
            base = foodOptions.filter { option in
                switch scope {
                case .all: true
                case .recent: option.source == .current || option.source == .recent
                case .favorites: favoriteFoodIDs.contains(option.id)
                case .common: option.source == .common
                }
            }
        } else {
            base = foodOptions.filter { option in
                ([option.name] + option.searchTerms)
                    .joined(separator: " ")
                    .lowercased()
                    .contains(normalizedQuery)
            }
        }

        return base.sorted { lhs, rhs in
            let lhsRank = foodRank(lhs)
            let rhsRank = foodRank(rhs)
            return lhsRank == rhsRank ? lhs.name < rhs.name : lhsRank < rhsRank
        }
    }

    private var selectedOptions: [NavaDietFoodOption] {
        foodOptions.filter { selectedFoodIDs.contains($0.id) }
    }

    private var selectedDishCount: Int {
        selectedOptions.reduce(0) { $0 + $1.dishCount }
    }

    private var selectedCalories: Int {
        selectedOptions.reduce(0) { $0 + $1.calories }
    }

    private var existingFoodOption: NavaDietFoodOption {
        NavaDietFoodOption(
            id: existingFoodID,
            name: primaryFoodName(from: draft),
            source: .current,
            meal: draft,
            searchTerms: [draft.title, draft.note]
        )
    }

    private var commonFoodOptions: [NavaDietFoodOption] {
        [
            NavaDietFoodOption(
                id: "common-tomato-eggs",
                name: isChinese ? "番茄炒蛋" : "Tomato Eggs",
                source: .common,
                meal: NavaDietMeal(
                    id: "common-tomato-eggs",
                    title: draft.title,
                    time: draft.time,
                    note: isChinese ? "番茄、鸡蛋" : "Tomato and eggs",
                    dishCount: 1,
                    calories: 286,
                    protein: 16,
                    carbs: 18,
                    fat: 17,
                    imageName: "NavaFoodTomatoEggs",
                    imageURL: nil
                ),
                searchTerms: isChinese ? ["家常菜", "鸡蛋", "番茄"] : ["home cooking", "egg", "tomato"]
            ),
            NavaDietFoodOption(
                id: "common-chicken-rice",
                name: isChinese ? "鸡胸时蔬饭" : "Chicken Rice Bowl",
                source: .common,
                meal: NavaDietMeal(
                    id: "common-chicken-rice",
                    title: draft.title,
                    time: draft.time,
                    note: isChinese ? "鸡胸肉、时蔬、糙米" : "Chicken, vegetables, brown rice",
                    dishCount: 1,
                    calories: 602,
                    protein: 46,
                    carbs: 41,
                    fat: 12,
                    imageName: "NavaFoodChickenRice",
                    imageURL: nil
                ),
                searchTerms: isChinese ? ["高蛋白", "鸡肉", "米饭"] : ["protein", "chicken", "rice"]
            ),
            NavaDietFoodOption(
                id: "common-seafood-paella",
                name: isChinese ? "海鲜烩饭" : "Seafood Paella",
                source: .common,
                meal: NavaDietMeal(
                    id: "common-seafood-paella",
                    title: draft.title,
                    time: draft.time,
                    note: isChinese ? "海鲜、米饭、彩椒" : "Seafood, rice, peppers",
                    dishCount: 1,
                    calories: 548,
                    protein: 29,
                    carbs: 68,
                    fat: 17,
                    imageName: "NavaFoodSeafoodPaella",
                    imageURL: nil
                ),
                searchTerms: isChinese ? ["海鲜", "烩饭", "米饭"] : ["seafood", "paella", "rice"]
            )
        ]
    }

    var body: some View {
        ZStack {
            NavaDietDashboardBackground()

            ScrollView {
                LazyVStack(spacing: 16) {
                    selectionSummary
                    scopePicker

                    if visibleFoodOptions.isEmpty {
                        emptySearchState
                    } else {
                        ForEach(visibleFoodOptions) { option in
                            NavaDietFoodLibraryCard(
                                option: option,
                                isSelected: selectedFoodIDs.contains(option.id),
                                isFavorite: favoriteFoodIDs.contains(option.id),
                                isChinese: isChinese,
                                onToggleSelection: {
                                    toggleSelection(option.id)
                                    query = ""
                                    dismissSearch()
                                },
                                onToggleFavorite: { toggleFavorite(option.id) }
                            )
                        }
                    }

                    deleteButton
                }
                .padding(.horizontal, NavaMetric.pageInset)
                .padding(.top, 10)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.immediately)
            .scrollIndicators(.hidden)
        }
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: isChinese ? "搜索历史、收藏或常见菜" : "Search history, favorites, or foods"
        )
        .navigationTitle(isChinese ? "编辑\(draft.title)" : "Edit \(draft.title)")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(false)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    saveSelection()
                } label: {
                    Image(systemName: "checkmark")
                        .fontWeight(.bold)
                }
                .disabled(selectedFoodIDs.isEmpty)
                .accessibilityLabel(isChinese ? "保存餐食修改" : "Save meal changes")
            }
        }
        .confirmationDialog(
            isChinese ? "删除\(draft.title)？" : "Delete \(draft.title)?",
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

    private var selectionSummary: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(isChinese ? "本餐已选" : "Selected for this meal")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NavaColor.secondaryInk)

                Text(isChinese
                    ? "\(selectedDishCount) 道 · \(selectedCalories) kcal"
                    : "\(selectedDishCount) dishes · \(selectedCalories) kcal"
                )
                .font(.title3.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(NavaColor.ink)
            }

            Spacer(minLength: 8)

            NavigationLink {
                NavaFoodScanView { result, asset in
                    applyRecognition(result, asset: asset)
                }
            } label: {
                Label(isChinese ? "拍照添加" : "Scan", systemImage: "camera.viewfinder")
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .accessibilityIdentifier("diet.meal.editor.rescan")
        }
        .padding(16)
        .background(Color.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var scopePicker: some View {
        Picker(isChinese ? "筛选菜品" : "Filter foods", selection: $scope) {
            ForEach(NavaDietFoodScope.allCases) { value in
                Text(value.title(isChinese: isChinese)).tag(value)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("diet.meal.editor.scope")
    }

    private var emptySearchState: some View {
        VStack(spacing: 12) {
            Image(systemName: query.isEmpty ? "star.slash" : "magnifyingglass")
                .font(.largeTitle)
                .foregroundStyle(NavaColor.accent)
            Text(query.isEmpty
                ? (isChinese ? "还没有收藏的菜品" : "No favorite foods yet")
                : (isChinese ? "没有找到“\(query)”" : "No results for \(query)")
            )
            .font(.headline)
            .foregroundStyle(NavaColor.ink)
            Text(isChinese ? "可以换个关键词，或拍照添加一道新菜。" : "Try another term or scan a new dish.")
                .font(.subheadline)
                .foregroundStyle(NavaColor.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
        .padding(20)
        .background(Color.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
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

    private func primaryFoodName(from meal: NavaDietMeal) -> String {
        let note = meal.note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !note.isEmpty else { return meal.title }
        let separators = ["等", "+", "、", ","]
        for separator in separators where note.contains(separator) {
            if let first = note.components(separatedBy: separator).first,
               !first.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return first.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        return note
    }

    private func foodRank(_ option: NavaDietFoodOption) -> Int {
        if favoriteFoodIDs.contains(option.id) { return 0 }
        if selectedFoodIDs.contains(option.id) { return 1 }
        switch option.source {
        case .current: return 2
        case .recent: return 3
        case .common: return 4
        }
    }

    private func toggleFavorite(_ id: String) {
        var updated = favoriteFoodIDs
        if updated.contains(id) {
            updated.remove(id)
        } else {
            updated.insert(id)
        }
        favoriteFoodIDsRaw = updated.sorted().joined(separator: ",")
    }

    private func toggleSelection(_ id: String) {
        if selectedFoodIDs.contains(id) {
            selectedFoodIDs.remove(id)
        } else {
            selectedFoodIDs.insert(id)
        }
    }

    private func saveSelection() {
        let selected = selectedOptions
        guard !selected.isEmpty else { return }

        if !(selected.count == 1 && selected[0].id == existingFoodID) {
            draft.note = selected.map(\.name).joined(separator: isChinese ? "、" : ", ")
            draft.dishCount = selected.reduce(0) { $0 + $1.dishCount }
            draft.calories = selected.reduce(0) { $0 + $1.calories }
            draft.protein = selected.reduce(0) { $0 + $1.protein }
            draft.carbs = selected.reduce(0) { $0 + $1.carbs }
            draft.fat = selected.reduce(0) { $0 + $1.fat }

            if let leading = selected.first {
                draft.imageName = leading.meal.imageName
                draft.imageURL = leading.meal.imageURL
            }
        }

        onSave(draft)
        dismiss()
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
        selectedFoodIDs = [existingFoodID]
    }

    private func roundedTotal(_ values: [Double]) -> Int? {
        guard !values.isEmpty else { return nil }
        return Int(values.reduce(0, +).rounded())
    }
}

private struct NavaDietFoodLibraryCard: View {
    let option: NavaDietFoodOption
    let isSelected: Bool
    let isFavorite: Bool
    let isChinese: Bool
    let onToggleSelection: () -> Void
    let onToggleFavorite: () -> Void

    @State private var isFlipped = false
    @State private var flipAngle = 0.0
    @State private var isAnimatingFlip = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 12) {
            cardHeader

            Group {
                if isFlipped {
                    back
                } else {
                    front
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .rotation3DEffect(
                .degrees(reduceMotion ? 0 : flipAngle),
                axis: (x: 0, y: 1, z: 0),
                perspective: 0.72
            )
        }
        .frame(maxWidth: .infinity)
        .frame(height: 372)
        .padding(18)
        .background(Color.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(isSelected ? NavaColor.accent.opacity(0.72) : Color.white.opacity(0.82), lineWidth: isSelected ? 2 : 1)
        }
        .shadow(color: NavaColor.ink.opacity(0.05), radius: 18, y: 8)
        .accessibilityValue(isFlipped ? (isChinese ? "营养信息面" : "Nutrition side") : (isChinese ? "图片面" : "Image side"))
    }

    private var front: some View {
        Button {
            flip(to: true)
        } label: {
            VStack(spacing: 12) {
                NavaDietMealArtwork(meal: option.meal)
                    .frame(width: 224, height: 224)
                    .accessibilityHidden(true)

                HStack(alignment: .center, spacing: 10) {
                    Label(option.source.title(isChinese: isChinese), systemImage: option.source.systemImage)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NavaColor.secondaryInk)

                    Spacer(minLength: 6)

                    Text("\(option.calories) kcal")
                        .font(.headline.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(NavaColor.ink)

                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(NavaColor.accent)
                    }
                }

                Text(isChinese ? "轻点卡片查看营养" : "Tap to view nutrition")
                    .font(.caption2)
                    .foregroundStyle(NavaColor.secondaryInk.opacity(0.82))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isChinese ? "查看\(option.name)营养" : "View nutrition for \(option.name)")
        .accessibilityIdentifier("diet.meal.food-card.\(option.id)")
    }

    private var back: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 18) {
                Text(option.meal.note)
                    .font(.subheadline)
                    .foregroundStyle(NavaColor.secondaryInk)
                    .lineLimit(2)

                LazyVGrid(
                    columns: [
                        GridItem(.flexible(), spacing: 18),
                        GridItem(.flexible(), spacing: 18)
                    ],
                    alignment: .leading,
                    spacing: 22
                ) {
                    nutrientLabel(
                        title: isChinese ? "热量" : "Calories",
                        value: "\(option.calories) kcal",
                        systemImage: "flame.fill",
                        tint: NavaColor.reward
                    )
                    nutrientLabel(
                        title: "Protein",
                        value: "\(option.protein) g",
                        systemImage: "leaf.fill",
                        tint: NavaColor.accent
                    )
                    nutrientLabel(
                        title: "Carbs",
                        value: "\(option.carbs) g",
                        systemImage: "circle.hexagongrid.fill",
                        tint: Color(red: 0.33, green: 0.68, blue: 0.78)
                    )
                    nutrientLabel(
                        title: "Fat",
                        value: "\(option.fat) g",
                        systemImage: "drop.fill",
                        tint: Color(red: 0.23, green: 0.48, blue: 0.62)
                    )
                }

                Label(
                    isChinese ? "轻点营养区域返回图片" : "Tap nutrition to return to image",
                    systemImage: "arrow.triangle.2.circlepath"
                )
                .font(.caption)
                .foregroundStyle(NavaColor.secondaryInk)
            }
            .contentShape(Rectangle())
            .onTapGesture { flip(to: false) }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(isChinese ? "返回\(option.name)图片" : "Return to image for \(option.name)")
            .accessibilityAction { flip(to: false) }
            .accessibilityIdentifier("diet.meal.food-card.\(option.id).back")

            Spacer(minLength: 0)

            Button(action: onToggleSelection) {
                Label(
                    isSelected
                        ? (isChinese ? "已加入本餐，点此移出" : "Added — tap to remove")
                        : (isChinese ? "加入本餐" : "Add to meal"),
                    systemImage: isSelected ? "checkmark.circle.fill" : "plus.circle"
                )
                .font(.headline.weight(.semibold))
                .foregroundStyle(isSelected ? NavaColor.accent : NavaColor.ink)
                .frame(minHeight: NavaMetric.minimumTap)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(selectionAccessibilityLabel)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var cardHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(option.name)
                .font(.title3.weight(.bold))
                .foregroundStyle(NavaColor.ink)
                .lineLimit(1)

            Spacer(minLength: 8)

            Button(action: onToggleFavorite) {
                Image(systemName: isFavorite ? "star.fill" : "star")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(isFavorite ? NavaColor.reward : NavaColor.secondaryInk)
                    .frame(width: NavaMetric.minimumTap, height: NavaMetric.minimumTap)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(favoriteAccessibilityLabel)
        }
        .frame(height: NavaMetric.minimumTap)
    }

    private func nutrientLabel(title: String, value: String, systemImage: String, tint: Color) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NavaColor.secondaryInk)
                Text(value)
                    .font(.headline.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(NavaColor.ink)
            }
        }
    }

    private var favoriteAccessibilityLabel: String {
        if isFavorite {
            return isChinese ? "取消收藏\(option.name)" : "Remove \(option.name) from favorites"
        }
        return isChinese ? "收藏\(option.name)" : "Favorite \(option.name)"
    }

    private var selectionAccessibilityLabel: String {
        if isSelected {
            return isChinese ? "从本餐移出\(option.name)" : "Remove \(option.name) from meal"
        }
        return isChinese ? "加入\(option.name)到本餐" : "Add \(option.name) to meal"
    }

    private func flip(to target: Bool) {
        guard target != isFlipped, !isAnimatingFlip else { return }
        if reduceMotion {
            isFlipped = target
            return
        }

        isAnimatingFlip = true
        let outgoingAngle = target ? 90.0 : -90.0
        let incomingAngle = target ? -90.0 : 90.0

        withAnimation(.easeIn(duration: 0.18)) {
            flipAngle = outgoingAngle
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            isFlipped = target
            flipAngle = incomingAngle
            withAnimation(.easeOut(duration: 0.22)) {
                flipAngle = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                isAnimatingFlip = false
            }
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
