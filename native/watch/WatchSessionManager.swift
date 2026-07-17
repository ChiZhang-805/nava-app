import Foundation
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
        guard WCSession.default.isReachable else {
            reply?(["ok": false, "errorCode": "iphone_unreachable", "message": "iPhone is not reachable"])
            return
        }

        WCSession.default.sendMessage(action, replyHandler: { response in
            reply?(response)
        }, errorHandler: { error in
            reply?(["ok": false, "errorCode": "send_failed", "message": error.localizedDescription])
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

