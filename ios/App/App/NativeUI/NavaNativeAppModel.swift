import SwiftUI

enum NavaTab: String, CaseIterable, Identifiable {
    case today, records, assistant, insights, profile

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .today: return "今日"
        case .records: return "记录"
        case .assistant: return "NAVA"
        case .insights: return "回顾"
        case .profile: return "我的"
        }
    }

    var symbol: String {
        switch self {
        case .today: return "house"
        case .records: return "square.and.pencil"
        case .assistant: return "bubble.left.and.bubble.right"
        case .insights: return "chart.xyaxis.line"
        case .profile: return "person.crop.circle"
        }
    }
}

enum NavaRoute: Hashable {
    case module(NavaHealthModule)
    case notifications
    case reminders
    case calendar
    case todos
    case personalProfile
    case accountSecurity
    case healthConnections
    case watch
    case privacy
    case wardrobe
    case pointsShop
    case foodScan
}

enum NavaHealthModule: String, CaseIterable, Identifiable, Codable, Hashable {
    case sleep, exercise, nutrition, mood, focus, face

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .sleep: return "睡眠"
        case .exercise: return "运动"
        case .nutrition: return "饮食"
        case .mood: return "情绪"
        case .focus: return "专注"
        case .face: return "面部"
        }
    }

    var symbol: String {
        switch self {
        case .sleep: return "moon.stars"
        case .exercise: return "figure.run"
        case .nutrition: return "fork.knife"
        case .mood: return "face.smiling"
        case .focus: return "brain.head.profile"
        case .face: return "faceid"
        }
    }

    var tint: Color {
        switch self {
        case .sleep: return Color.indigo
        case .exercise: return Color.green
        case .nutrition: return Color.orange
        case .mood: return Color.pink
        case .focus: return Color.cyan
        case .face: return Color.teal
        }
    }

    var summary: LocalizedStringKey {
        switch self {
        case .sleep: return "记录睡眠时间与恢复感受"
        case .exercise: return "记录活动、训练和身体反馈"
        case .nutrition: return "记录餐食、饮水与营养信息"
        case .mood: return "记录情绪强度与影响因素"
        case .focus: return "开始专注并回顾效率"
        case .face: return "在明确同意后记录面部状态"
        }
    }
}

@MainActor
final class NavaNativeAppModel: ObservableObject {
    @Published var selectedTab: NavaTab = .today
    @Published var todayPath = NavigationPath()
    @Published var recordsPath = NavigationPath()
    @Published var profilePath = NavigationPath()
    @Published var moduleOrder: [NavaHealthModule]
    @Published var isBusy = false
    @Published var showingModuleOrder = false

    private let orderKey = "nava.native.module-order.v1"

    init(defaults: UserDefaults = .standard) {
        if let data = defaults.data(forKey: orderKey),
           let decoded = try? JSONDecoder().decode([NavaHealthModule].self, from: data),
           Set(decoded) == Set(NavaHealthModule.allCases),
           decoded.count == NavaHealthModule.allCases.count {
            moduleOrder = decoded
        } else {
            moduleOrder = [.sleep, .exercise, .nutrition, .mood, .focus, .face]
        }
    }

    func moveModules(from offsets: IndexSet, to destination: Int) {
        moduleOrder.move(fromOffsets: offsets, toOffset: destination)
        if let data = try? JSONEncoder().encode(moduleOrder) {
            UserDefaults.standard.set(data, forKey: orderKey)
        }
    }
}
