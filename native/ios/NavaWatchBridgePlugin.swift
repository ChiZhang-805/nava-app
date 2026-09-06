import Foundation
import Capacitor
import WatchConnectivity

@objc(NavaWatchBridgePlugin)
public class NavaWatchBridgePlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "NavaWatchBridgePlugin"
    public let jsName = "NavaWatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publishSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isReachable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainPendingActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgePendingActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAccountState", returnType: CAPPluginReturnPromise)
    ]

    private let pendingActionsQueue = DispatchQueue(label: "health.nava.watch.pending-actions")
    private let maxPendingActions = 100

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

    @objc func drainPendingActions(_ call: CAPPluginCall) {
        pendingActionsQueue.async {
            do {
                let actions = try self.readPendingActions()
                DispatchQueue.main.async {
                    call.resolve(["actions": actions])
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Unable to read pending Watch actions.", nil, error)
                }
            }
        }
    }

    @objc func acknowledgePendingActions(_ call: CAPPluginCall) {
        let actionIds = Set(call.getArray("actionIds", String.self) ?? [])
        guard !actionIds.isEmpty else {
            call.resolve(["ok": true, "removed": 0])
            return
        }

        pendingActionsQueue.async {
            do {
                let current = try self.readPendingActions()
                let retained = current.filter { action in
                    guard let actionId = action["actionId"] as? String else { return true }
                    return !actionIds.contains(actionId)
                }
                try self.writePendingActions(retained)
                DispatchQueue.main.async {
                    call.resolve(["ok": true, "removed": current.count - retained.count])
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Unable to acknowledge pending Watch actions.", nil, error)
                }
            }
        }
    }

    @objc func clearAccountState(_ call: CAPPluginCall) {
        pendingActionsQueue.async {
            do {
                try self.writePendingActions([])
                if WCSession.isSupported() {
                    self.activateSession()
                    try WCSession.default.updateApplicationContext([
                        "signedOut": true,
                        "clearedAt": ISO8601DateFormatter().string(from: Date())
                    ])
                }
                DispatchQueue.main.async { call.resolve(["ok": true]) }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Unable to clear Watch account state.", nil, error)
                }
            }
        }
    }

    private func activateSession() {
        guard WCSession.isSupported() else { return }
        if WCSession.default.delegate !== self {
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

    private func pendingActionsURL() throws -> URL {
        guard let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw CocoaError(.fileNoSuchFile)
        }
        let directory = applicationSupport.appendingPathComponent("NAVA", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("pending-watch-actions.json", isDirectory: false)
    }

    private func readPendingActions() throws -> [[String: Any]] {
        let url = try pendingActionsURL()
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let data = try Data(contentsOf: url)
        guard !data.isEmpty else { return [] }
        return try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
    }

    private func writePendingActions(_ actions: [[String: Any]]) throws {
        let url = try pendingActionsURL()
        let data = try JSONSerialization.data(withJSONObject: actions)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func persistAndDeliverAction(_ receivedAction: [String: Any], completion: ((Result<[String: Any], Error>) -> Void)? = nil) {
        pendingActionsQueue.async {
            do {
                var action = receivedAction
                if (action["actionId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
                    action["actionId"] = UUID().uuidString
                }
                guard JSONSerialization.isValidJSONObject(action) else {
                    throw CocoaError(.propertyListReadCorrupt)
                }

                var pending = try self.readPendingActions()
                let actionId = action["actionId"] as? String ?? ""
                if !pending.contains(where: { ($0["actionId"] as? String) == actionId }) {
                    pending.append(action)
                    if pending.count > self.maxPendingActions {
                        pending.removeFirst(pending.count - self.maxPendingActions)
                    }
                    try self.writePendingActions(pending)
                }

                DispatchQueue.main.async {
                    self.notifyListeners("watchAction", data: action)
                    completion?(.success(action))
                }
            } catch {
                DispatchQueue.main.async {
                    completion?(.failure(error))
                }
            }
        }
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        persistAndDeliverAction(message)
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
        persistAndDeliverAction(message) { result in
            switch result {
            case .success(let action):
                replyHandler([
                    "ok": true,
                    "accepted": true,
                    "actionId": action["actionId"] as? String ?? "",
                    "acceptedAt": ISO8601DateFormatter().string(from: Date())
                ])
            case .failure:
                replyHandler([
                    "ok": false,
                    "accepted": false,
                    "actionId": message["actionId"] as? String ?? "",
                    "errorCode": "phone_queue_unavailable"
                ])
            }
        }
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        persistAndDeliverAction(userInfo)
    }
}
