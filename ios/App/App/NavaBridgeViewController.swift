import Capacitor
import UIKit
import UserNotifications

final class NavaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(NavaHealthPlugin())
        bridge?.registerPluginInstance(NavaSecureStoragePlugin())
        bridge?.registerPluginInstance(NavaWatchBridgePlugin())
        bridge?.registerPluginInstance(NavaSpeechPlugin())
        bridge?.registerPluginInstance(NavaWakeLockPlugin())
        bridge?.registerPluginInstance(NavaNotificationPermissionPlugin())
    }
}

/// Authorization is requested only after a person enables an individual reminder.
@objc(NavaNotificationPermissionPlugin)
final class NavaNotificationPermissionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NavaNotificationPermissionPlugin"
    let jsName = "NavaNotificationPermission"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ensurePermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            // Provisional permission delivers quietly, not the requested lock-screen/banner experience.
            call.resolve(["granted": settings.authorizationStatus == .authorized])
        }
    }

    @objc func ensurePermission(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized:
                call.resolve(["status": "granted"])
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
                    if error != nil { call.reject("Notification authorization failed"); return }
                    call.resolve(["status": granted ? "granted" : "denied"])
                }
            default:
                self.offerSettings(call)
            }
        }
    }

    private func offerSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active,
                  let controller = self.bridge?.viewController,
                  controller.presentedViewController == nil else {
                call.resolve(["status": "cancelled"]); return
            }
            let zh = call.getString("locale") == "zh"
            let alert = UIAlertController(
                title: zh ? "允许 NAVA 通知" : "Allow NAVA notifications",
                message: zh ? "请在设置中允许通知，以接收提醒。" : "Allow notifications in Settings to receive reminders.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: zh ? "暂不" : "Not now", style: .cancel) { _ in
                call.resolve(["status": "cancelled"])
            })
            alert.addAction(UIAlertAction(title: zh ? "前往设置" : "Open Settings", style: .default) { _ in
                let address: String
                if #available(iOS 16.0, *) { address = UIApplication.openNotificationSettingsURLString }
                else { address = UIApplication.openSettingsURLString }
                guard let url = URL(string: address) else { call.reject("Settings unavailable"); return }
                UIApplication.shared.open(url, options: [:]) { opened in
                    if opened { call.resolve(["status": "settings"] ) }
                    else { call.reject("Unable to open Settings") }
                }
            })
            controller.present(alert, animated: true)
        }
    }
}

/// A foreground-only lease. Backgrounding, calls and manual locking always win.
@objc(NavaWakeLockPlugin)
final class NavaWakeLockPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NavaWakeLockPlugin"
    let jsName = "NavaWakeLock"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "acquire", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise)
    ]
    private var leases = Set<String>()
    private var observer: NSObjectProtocol?

    override func load() {
        observer = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.leases.removeAll()
            UIApplication.shared.isIdleTimerDisabled = false
            self.notifyListeners("released", data: [:])
        }
    }

    @objc func acquire(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("Missing lease"); return }
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active else {
                call.resolve(["active": false]); return
            }
            self.leases.insert(id)
            UIApplication.shared.isIdleTimerDisabled = true
            call.resolve(["active": UIApplication.shared.isIdleTimerDisabled])
        }
    }

    @objc func release(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let id = call.getString("id") { self.leases.remove(id) }
            UIApplication.shared.isIdleTimerDisabled = !self.leases.isEmpty
            call.resolve()
        }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
    }
}
