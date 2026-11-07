import SwiftUI

struct NavaNativeRootView: View {
    @StateObject private var model = NavaNativeAppModel()
    @State private var appliedVisualRoute = false
    let openLegacyExperience: () -> Void

    private var startsOnDietDashboard: Bool {
        ProcessInfo.processInfo.arguments.contains("-NavaVisualDietDashboard")
    }

    var body: some View {
        TabView(selection: $model.selectedTab) {
            NavaTodayView(model: model)
                .tabItem { Label(NavaTab.today.title, systemImage: NavaTab.today.symbol) }
                .tag(NavaTab.today)

            NavaRecordsView(model: model)
                .tabItem { Label(NavaTab.records.title, systemImage: NavaTab.records.symbol) }
                .tag(NavaTab.records)

            NavaAssistantView(openLegacyExperience: openLegacyExperience)
                .tabItem { Label(NavaTab.assistant.title, systemImage: NavaTab.assistant.symbol) }
                .tag(NavaTab.assistant)

            NavaInsightsView()
                .tabItem { Label(NavaTab.insights.title, systemImage: NavaTab.insights.symbol) }
                .tag(NavaTab.insights)

            NavaProfileView(model: model, openLegacyExperience: openLegacyExperience)
                .tabItem { Label(NavaTab.profile.title, systemImage: NavaTab.profile.symbol) }
                .tag(NavaTab.profile)
        }
        .environmentObject(model)
        .navaNavigationStyle()
        .onAppear {
            guard startsOnDietDashboard, !appliedVisualRoute else { return }
            appliedVisualRoute = true
            model.selectedTab = .today
            model.todayPath.append(NavaRoute.module(.nutrition))
        }
    }
}

struct NavaTodayView: View {
    @ObservedObject var model: NavaNativeAppModel
    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack(path: $model.todayPath) {
            NavaNoScrollPage {
                GeometryReader { proxy in
                    let compact = proxy.size.height < 690
                    VStack(spacing: compact ? 10 : 14) {
                        HStack(spacing: 12) {
                            NavaMetricPill(icon: "bolt.fill", tint: NavaColor.warning, value: "--/100")
                            NavaMetricPill(icon: "circle.circle.fill", tint: NavaColor.reward, value: "200")
                            Button {
                                model.todayPath.append(NavaRoute.notifications)
                            } label: {
                                Image(systemName: "bell")
                                    .font(.headline)
                                    .frame(width: 48, height: 48)
                                    .background(.thinMaterial, in: Circle())
                            }
                            .accessibilityLabel("通知")
                        }
                        .foregroundStyle(NavaColor.ink)

                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("今天")
                                    .font(.largeTitle.weight(.bold))
                                Text("六个健康模块始终保留，可拖动调整顺序")
                                    .font(.subheadline)
                                    .foregroundStyle(NavaColor.secondaryInk)
                            }
                            Spacer()
                            Button {
                                model.showingModuleOrder = true
                            } label: {
                                Image(systemName: "arrow.up.arrow.down")
                                    .frame(width: 44, height: 44)
                                    .background(.thinMaterial, in: Circle())
                            }
                            .accessibilityLabel("调整模块顺序")
                        }
                        .foregroundStyle(NavaColor.ink)

                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(model.moduleOrder) { module in
                                Button {
                                    model.todayPath.append(NavaRoute.module(module))
                                } label: {
                                    NavaModuleCard(module: module, compact: compact)
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        Spacer(minLength: 0)

                        Image("NavaMascot")
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: compact ? 118 : 168)
                            .accessibilityLabel("NAVA 小猫")
                    }
                    .foregroundStyle(NavaColor.ink)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(for: NavaRoute.self) { route in
                NavaRouteView(route: route)
            }
            .sheet(isPresented: $model.showingModuleOrder) {
                NavaModuleOrderSheet(model: model)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
        }
    }
}

private struct NavaModuleCard: View {
    let module: NavaHealthModule
    let compact: Bool

    var body: some View {
        NavaCard(padding: compact ? 12 : 14) {
            VStack(alignment: .leading, spacing: compact ? 5 : 8) {
                HStack {
                    Image(systemName: module.symbol)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(module.tint)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(NavaColor.secondaryInk)
                }
                Text(module.title)
                    .font(.headline.weight(.bold))
                Text(module.summary)
                    .font(.caption)
                    .foregroundStyle(NavaColor.secondaryInk)
                    .lineLimit(compact ? 1 : 2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, minHeight: compact ? 74 : 96, alignment: .topLeading)
        }
    }
}

private struct NavaModuleOrderSheet: View {
    @ObservedObject var model: NavaNativeAppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(model.moduleOrder) { module in
                        Label(module.title, systemImage: module.symbol)
                            .foregroundStyle(NavaColor.ink)
                    }
                    .onMove(perform: model.moveModules)
                } footer: {
                    Text("六个模块不会被删除；长按右侧手柄即可调整首页顺序。")
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("调整顺序")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                }
            }
        }
    }
}

struct NavaRecordsView: View {
    @ObservedObject var model: NavaNativeAppModel

    var body: some View {
        NavigationStack(path: $model.recordsPath) {
            NavaScrollPage {
                VStack(spacing: 16) {
                    NavaPageHeader(title: "数据记录")
                    NavaCard {
                        NavaSectionTitle(icon: "square.and.pencil", title: "选择记录类型")
                        VStack(spacing: 4) {
                            ForEach(model.moduleOrder) { module in
                                NavigationLink(value: NavaRoute.module(module)) {
                                    HStack(spacing: 14) {
                                        Image(systemName: module.symbol)
                                            .font(.title3)
                                            .foregroundStyle(module.tint)
                                            .frame(width: 34, height: 34)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(module.title).font(.headline)
                                            Text(module.summary)
                                                .font(.subheadline)
                                                .foregroundStyle(NavaColor.secondaryInk)
                                                .lineLimit(2)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .foregroundStyle(NavaColor.secondaryInk)
                                    }
                                    .frame(minHeight: 62)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                if module.id != model.moduleOrder.last?.id { Divider().overlay(NavaColor.divider) }
                            }
                        }
                    }
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(for: NavaRoute.self) { NavaRouteView(route: $0) }
        }
    }
}

struct NavaAssistantView: View {
    @State private var message = ""
    let openLegacyExperience: () -> Void

    var body: some View {
        NavigationStack {
            NavaNoScrollPage {
                VStack(spacing: 14) {
                    NavaPageHeader(title: "NAVA")
                    Spacer(minLength: 8)
                    Image("NavaMascot")
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 230)
                        .accessibilityHidden(true)
                    VStack(spacing: 8) {
                        Text("我在这里")
                            .font(.title.weight(.bold))
                        Text("原生对话将继续沿用现有账号、历史和安全边界；迁移完成前可进入当前可用版本。")
                            .font(.body)
                            .foregroundStyle(NavaColor.secondaryInk)
                            .multilineTextAlignment(.center)
                    }
                    Spacer(minLength: 8)
                    NavaCard(padding: 10) {
                        HStack(spacing: 10) {
                            TextField("告诉 NAVA 你现在的感受", text: $message, axis: .vertical)
                                .font(.body)
                                .lineLimit(1...4)
                            Button(action: openLegacyExperience) {
                                Image(systemName: "arrow.up")
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 44, height: 44)
                                    .background(NavaColor.ink, in: Circle())
                            }
                            .accessibilityLabel("进入当前对话")
                        }
                    }
                }
                .foregroundStyle(NavaColor.ink)
            }
            .navigationBarHidden(true)
        }
    }
}

struct NavaInsightsView: View {
    private let modules = NavaHealthModule.allCases

    var body: some View {
        NavigationStack {
            NavaScrollPage {
                VStack(spacing: 16) {
                    NavaPageHeader(title: "数据回顾")
                    NavaCard {
                        NavaSectionTitle(icon: "chart.bar.xaxis", title: "本周节律")
                        Text("真实记录接入后，这里显示跨模块趋势；无数据时不生成虚假分数。")
                            .font(.body)
                            .foregroundStyle(NavaColor.secondaryInk)
                            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(modules) { module in
                            NavaCard(padding: 14) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Label(module.title, systemImage: module.symbol)
                                        .font(.headline.weight(.bold))
                                        .foregroundStyle(NavaColor.ink)
                                    Text("等待真实记录")
                                        .font(.subheadline)
                                        .foregroundStyle(NavaColor.secondaryInk)
                                }
                                .frame(maxWidth: .infinity, minHeight: 82, alignment: .topLeading)
                            }
                        }
                    }
                }
            }
            .navigationBarHidden(true)
        }
    }
}

struct NavaProfileView: View {
    @ObservedObject var model: NavaNativeAppModel
    let openLegacyExperience: () -> Void

    var body: some View {
        NavigationStack(path: $model.profilePath) {
            NavaScrollPage {
                VStack(spacing: 16) {
                    NavaPageHeader(title: "我的")
                    NavaCard {
                        NavaSectionTitle(icon: "person", title: "账户")
                        HStack(spacing: 14) {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.system(size: 54))
                                .foregroundStyle(NavaColor.accent)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("当前账户")
                                    .font(.headline.weight(.bold))
                                Text("资料由当前登录会话读取")
                                    .font(.subheadline)
                                    .foregroundStyle(NavaColor.secondaryInk)
                            }
                            Spacer()
                        }
                    }
                    NavaCard {
                        NavaSectionTitle(icon: "square.grid.2x2", title: "快捷入口")
                        VStack(spacing: 0) {
                            NavaProfileLink(title: "个人资料", icon: "person.text.rectangle", route: .personalProfile)
                            NavaProfileLink(title: "账号与安全", icon: "lock.shield", route: .accountSecurity)
                            NavaProfileLink(title: "Apple 健康", icon: "heart.text.square", route: .healthConnections)
                            NavaProfileLink(title: "Apple Watch", icon: "applewatch", route: .watch)
                            NavaProfileLink(title: "隐私与数据", icon: "hand.raised", route: .privacy)
                            NavaProfileLink(title: "小猫衣橱", icon: "tshirt", route: .wardrobe)
                        }
                    }
                    Button("迁移期间进入当前完整版本", action: openLegacyExperience)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NavaColor.accent)
                        .frame(minHeight: 44)
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(for: NavaRoute.self) { NavaRouteView(route: $0) }
        }
    }
}

private struct NavaProfileLink: View {
    let title: LocalizedStringKey
    let icon: String
    let route: NavaRoute

    var body: some View {
        NavigationLink(value: route) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(NavaColor.accent)
                    .frame(width: 30)
                Text(title).font(.headline)
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundStyle(NavaColor.secondaryInk)
            }
            .foregroundStyle(NavaColor.ink)
            .frame(minHeight: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Divider().overlay(NavaColor.divider)
    }
}

struct NavaRouteView: View {
    let route: NavaRoute

    var body: some View {
        switch route {
        case .module(let module):
            if module == .nutrition {
                NavaDietDashboardView()
            } else {
                NavaModuleDetailView(module: module)
            }
        case .notifications: NavaSimpleNativePage(title: "通知", symbol: "bell")
        case .reminders: NavaSimpleNativePage(title: "提醒设置", symbol: "clock.badge")
        case .calendar: NavaSimpleNativePage(title: "日历", symbol: "calendar")
        case .todos: NavaSimpleNativePage(title: "今日安排", symbol: "checklist")
        case .personalProfile: NavaSimpleNativePage(title: "个人资料", symbol: "person.text.rectangle")
        case .accountSecurity: NavaSimpleNativePage(title: "账号与安全", symbol: "lock.shield")
        case .healthConnections: NavaSimpleNativePage(title: "Apple 健康", symbol: "heart.text.square")
        case .watch: NavaSimpleNativePage(title: "Apple Watch", symbol: "applewatch")
        case .privacy: NavaSimpleNativePage(title: "隐私与数据", symbol: "hand.raised")
        case .wardrobe: NavaSimpleNativePage(title: "小猫衣橱", symbol: "tshirt")
        case .pointsShop: NavaSimpleNativePage(title: "积分商城", symbol: "bag")
        case .foodScan: NavaFoodScanView()
        }
    }
}

private struct NavaModuleDetailView: View {
    let module: NavaHealthModule

    var body: some View {
        NavaScrollPage {
            VStack(spacing: 16) {
                NavaPageHeader(title: module.title)
                NavaCard {
                    NavaSectionTitle(icon: module.symbol, title: module.title)
                    Text(module.summary)
                        .font(.body)
                        .foregroundStyle(NavaColor.secondaryInk)
                    if module == .nutrition {
                        NavigationLink(value: NavaRoute.foodScan) {
                            Label("扫描餐食", systemImage: "camera.viewfinder")
                                .font(.headline.weight(.semibold))
                                .frame(maxWidth: .infinity, minHeight: 54)
                                .foregroundStyle(.white)
                                .background(NavaColor.ink, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    } else {
                        NavaPrimaryButton(title: "开始记录", icon: "plus") { }
                    }
                }
                NavaCard {
                    NavaSectionTitle(icon: "clock.arrow.circlepath", title: "近期记录")
                    Text("迁移真实数据访问层后显示当前账户记录。这里不会填充演示健康数据。")
                        .foregroundStyle(NavaColor.secondaryInk)
                        .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
                }
            }
        }
        .navigationBarBackButtonHidden(false)
        .toolbar(.hidden, for: .tabBar)
    }
}

private struct NavaSimpleNativePage: View {
    let title: LocalizedStringKey
    let symbol: String

    var body: some View {
        NavaNoScrollPage {
            VStack(spacing: 20) {
                Spacer()
                Image(systemName: symbol)
                    .font(.system(size: 52, weight: .light))
                    .foregroundStyle(NavaColor.accent)
                Text(title)
                    .font(.title.weight(.bold))
                    .foregroundStyle(NavaColor.ink)
                Text("视觉和导航骨架已迁入 SwiftUI；真实功能与现有服务将在对应迁移阶段接通。")
                    .font(.body)
                    .foregroundStyle(NavaColor.secondaryInk)
                    .multilineTextAlignment(.center)
                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .toolbar(.hidden, for: .tabBar)
    }
}

#if DEBUG
struct NavaNativeRootView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            NavaNativeRootView(openLegacyExperience: {})
                .previewDisplayName("iPhone 15 Pro")
            NavaNativeRootView(openLegacyExperience: {})
                .previewDevice("iPhone SE (3rd generation)")
                .previewDisplayName("Compact")
        }
    }
}
#endif
