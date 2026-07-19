import Foundation
import Combine
import WatchConnectivity

final class WatchSessionManager: NSObject, WCSessionDelegate, ObservableObject {
    static let shared = WatchSessionManager()

    @Published private(set) var latestSnapshot: [String: Any] = [:]
    @Published private(set) var reachable = false

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func sendAction(_ action: [String: Any], reply: (([String: Any]) -> Void)? = nil) {
        guard WCSession.isSupported() else {
            reply?(["ok": false, "errorCode": "watch_connectivity_unsupported", "message": "WatchConnectivity is unavailable"])
            return
        }
        activate()
        var payload = action
        if payload["actionId"] == nil { payload["actionId"] = UUID().uuidString.lowercased() }

        guard WCSession.default.isReachable else {
            WCSession.default.transferUserInfo(payload)
            reply?(["ok": true, "queued": true, "actionId": payload["actionId"] ?? ""])
            return
        }

        WCSession.default.sendMessage(payload, replyHandler: { response in
            DispatchQueue.main.async { reply?(response) }
        }, errorHandler: { _ in
            WCSession.default.transferUserInfo(payload)
            DispatchQueue.main.async {
                reply?(["ok": true, "queued": true, "actionId": payload["actionId"] ?? ""])
            }
        })
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.reachable = session.isReachable
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.reachable = session.isReachable
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        DispatchQueue.main.async {
            self.latestSnapshot = applicationContext
        }
    }
}
