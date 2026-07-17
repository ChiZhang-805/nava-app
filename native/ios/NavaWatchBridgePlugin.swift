import Foundation
import Capacitor
import WatchConnectivity

@objc(NavaWatchBridgePlugin)
public class NavaWatchBridgePlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "NavaWatchBridgePlugin"
    public let jsName = "NavaWatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publishSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isReachable", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        super.load()
        activateSession()
    }

    @objc func publishSnapshot(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else {
            call.resolve(["ok": false, "reason": "watch_connectivity_unsupported"])
            return
        }
        activateSession()

        let snapshot = call.getObject("snapshot") ?? [:]
        do {
            try WCSession.default.updateApplicationContext(snapshot)
            call.resolve(["ok": true])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func isReachable(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else {
            call.resolve(["paired": false, "reachable": false])
            return
        }
        activateSession()
        call.resolve([
            "paired": WCSession.default.isPaired,
            "reachable": WCSession.default.isReachable
        ])
    }

    private func activateSession() {
        guard WCSession.isSupported() else { return }
        if WCSession.default.delegate == nil {
            WCSession.default.delegate = self
        }
        if WCSession.default.activationState == .notActivated {
            WCSession.default.activate()
        }
    }

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        notifyListeners("watchAction", data: message)
    }
}

