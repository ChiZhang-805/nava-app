import SwiftUI

@main
struct NavaWatchApp: App {
    @StateObject private var session = WatchSessionManager.shared

    var body: some Scene {
        WindowGroup {
            WatchHomeView()
                .environmentObject(session)
                .onAppear { session.activate() }
        }
    }
}
