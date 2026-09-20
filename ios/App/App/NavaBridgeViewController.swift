import Capacitor
import UIKit

final class NavaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(NavaHealthPlugin())
        bridge?.registerPluginInstance(NavaSecureStoragePlugin())
        bridge?.registerPluginInstance(NavaWatchBridgePlugin())
        bridge?.registerPluginInstance(NavaSpeechPlugin())
        bridge?.registerPluginInstance(NavaWakeLockPlugin())
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
