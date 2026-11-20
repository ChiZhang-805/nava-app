import AuthenticationServices
import Capacitor
import CryptoKit
import SwiftUI
import UIKit
import UserNotifications
import WebKit

final class NavaBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private var nativeHost: UIHostingController<NavaNativeRootView>?
    private var authMessageProxy: NavaWeakScriptMessageHandler?
    private var authViewportEnabled = false
    private var keepsRootPinned = false
    private var pinsKeyboardViewport = false
    private var keyboardScreenFrame = CGRect.null
    private var scrollObservation: NSKeyValueObservation?
    private var lastAuthViewport: [String: Double] = [:]

    private var startsOnDietDashboard: Bool {
        ProcessInfo.processInfo.arguments.contains("-NavaVisualDietDashboard")
    }

    private static let startupBackground = UIColor(
        red: 143.0 / 255.0,
        green: 207.0 / 255.0,
        blue: 233.0 / 255.0,
        alpha: 1
    )

    override func viewDidLoad() {
        super.viewDidLoad()
        installKeyboardViewportObserver()
        view.backgroundColor = Self.startupBackground
    }

    #if targetEnvironment(simulator)
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        // Capacitor replaces the content controller after webViewConfiguration;
        // install on the final controller, before creating/loading WKWebView.
        // Test the actual system picker bridge without a production account.
        // This code is absent from every device archive, including TestFlight.
        if ProcessInfo.processInfo.arguments.contains("-NavaPickerBoundaryTest") {
            let script = #"""
            window.addEventListener('load', () => {
              const host = document.createElement('section');
              host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;padding:100px 24px;color:black';
              host.innerHTML = '<h1>Picker boundary test</h1><input aria-label="Preserved draft" value="Keep this draft"><button id="native-library">Photo library</button><button id="native-file">Choose file</button><input id="boundary-file" type="file" accept=".txt,.md,.csv,.json" hidden><p id="boundary-status" role="status">Ready</p>';
              document.body.append(host);
              const status = host.querySelector('#boundary-status');
              host.querySelector('#native-library').onclick = async () => {
                status.textContent = 'Opening photos';
                try {
                  const result = await window.Capacitor.nativePromise('Camera', 'getPhoto', {source:'PHOTOS',resultType:'uri',quality:90,width:1600,height:1600,correctOrientation:true,allowEditing:false,saveToGallery:false,presentationStyle:'fullscreen'});
                  status.textContent = result.webPath ? 'Photo selected' : 'No photo';
                } catch (error) { status.textContent = /cancel/i.test(error.message || '') ? 'Photo cancelled' : 'Photo error: ' + error.message; }
              };
              const file = host.querySelector('#boundary-file');
              host.querySelector('#native-file').onclick = () => file.click();
              file.oncancel = () => { status.textContent = 'File cancelled'; };
              file.onchange = () => { status.textContent = file.files.length ? 'File selected' : 'File cancelled'; };
            }, {once:true});
            """#
            configuration.userContentController.addUserScript(
                WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
        }
        return super.webView(with: frame, configuration: configuration)
    }
    #endif

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.webView?.isOpaque = false
        bridge?.webView?.backgroundColor = Self.startupBackground
        bridge?.webView?.scrollView.backgroundColor = Self.startupBackground
        bridge?.registerPluginInstance(NavaHealthPlugin())
        bridge?.registerPluginInstance(NavaSecureStoragePlugin())
        bridge?.registerPluginInstance(NavaWatchBridgePlugin())
        bridge?.registerPluginInstance(NavaSpeechPlugin())
        bridge?.registerPluginInstance(NavaWakeLockPlugin())
        bridge?.registerPluginInstance(NavaNotificationPermissionPlugin())
        bridge?.registerPluginInstance(NavaAppleSignInPlugin())
        bridge?.registerPluginInstance(NavaExternalAuthPlugin())
        bridge?.registerPluginInstance(NavaAuthViewportPlugin())

        if NavaNativeFeatureFlag.isEnabled, startsOnDietDashboard {
            presentNativeExperience()
        } else if NavaNativeFeatureFlag.isEnabled {
            let proxy = NavaWeakScriptMessageHandler(delegate: self)
            authMessageProxy = proxy
            bridge?.webView?.configuration.userContentController.add(proxy, name: "navaAuthState")
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(lockNativeExperience),
                name: UIApplication.didEnterBackgroundNotification,
                object: nil
            )
        }
    }

    // Keep Capacitor's root view intact. The web layer paints the entire skin
    // and scrolls only the active page or form when the root is pinned.
    private func installKeyboardViewportObserver() {
        guard let webView = bridge?.webView else { return }
        scrollObservation = webView.scrollView.observe(\.contentOffset, options: [.new]) { [weak self] scroll, _ in
            guard self?.pinsKeyboardViewport == true, scroll.contentOffset != .zero else { return }
            // Keep the root still. CSS scroll views reveal the focused field.
            scroll.setContentOffset(.zero, animated: false)
        }
        for name in [UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardDidChangeFrameNotification] {
            NotificationCenter.default.addObserver(self, selector: #selector(authKeyboardChanged(_:)), name: name, object: nil)
        }
        NotificationCenter.default.addObserver(self, selector: #selector(authKeyboardHidden), name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        publishAuthViewport()
    }

    func setAuthViewportEnabled(_ enabled: Bool, keepRootPinned: Bool) -> [String: Double] {
        authViewportEnabled = enabled
        keepsRootPinned = enabled && keepRootPinned
        if !enabled { pinKeyboardViewport(false) }
        if keepsRootPinned { pinKeyboardViewport(true) }
        lastAuthViewport = [:]
        view.layoutIfNeeded()
        publishAuthViewport()
        return authViewportMetrics()
    }

    private func pinKeyboardViewport(_ pinned: Bool) {
        guard pinsKeyboardViewport != pinned, let scroll = bridge?.webView?.scrollView else { return }
        pinsKeyboardViewport = pinned
        scroll.isScrollEnabled = !pinned
        scroll.bounces = !pinned
        if pinned { scroll.setContentOffset(.zero, animated: false) }
    }

    @objc private func authKeyboardChanged(_ notification: Notification) {
        guard let value = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue else { return }
        keyboardScreenFrame = value.cgRectValue
        publishAuthViewport()
    }

    @objc private func authKeyboardHidden() {
        keyboardScreenFrame = .null
        publishAuthViewport()
    }

    private func authViewportMetrics() -> [String: Double] {
        let height = view.bounds.height
        var visibleHeight = height
        if !keyboardScreenFrame.isNull, let window = view.window {
            let frameInWindow = window.convert(keyboardScreenFrame, from: window.screen.coordinateSpace)
            let frame = view.convert(frameInWindow, from: window)
            let overlap = view.bounds.intersection(frame)
            // A floating iPad keyboard is not a full-width bottom obstruction.
            if !overlap.isNull, overlap.width >= view.bounds.width * 0.8, frame.maxY >= height - 1 {
                visibleHeight = max(0, min(height, frame.minY))
            }
        }
        return ["height": Double(height), "visibleHeight": Double(visibleHeight)]
    }

    private func publishAuthViewport() {
        guard authViewportEnabled else { return }
        let metrics = authViewportMetrics()
        pinKeyboardViewport(keepsRootPinned || metrics["visibleHeight", default: 0] < metrics["height", default: 0])
        guard metrics["height", default: 0] > 0, metrics != lastAuthViewport,
              let data = try? JSONSerialization.data(withJSONObject: metrics),
              let json = String(data: data, encoding: .utf8) else { return }
        lastAuthViewport = metrics
        bridge?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('nava:auth-viewport', {detail: \(json)}))")
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: "navaAuthState")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "navaAuthState",
              let payload = message.body as? [String: Any],
              let authenticated = payload["authenticated"] as? Bool else { return }

        DispatchQueue.main.async { [weak self] in
            if authenticated {
                self?.presentNativeExperience()
            } else {
                self?.dismissNativeExperience()
            }
        }
    }

    @objc private func lockNativeExperience() {
        guard NavaNativeFeatureFlag.isEnabled, !startsOnDietDashboard else { return }
        dismissNativeExperience()
        bridge?.webView?.evaluateJavaScript("window.dispatchEvent(new Event('nava:native-lock'))")
    }

    private func presentNativeExperience() {
        guard nativeHost == nil else { return }
        let root = NavaNativeRootView { [weak self] in
            self?.dismissNativeExperience()
        }
        let host = UIHostingController(rootView: root)
        host.view.backgroundColor = .clear
        addChild(host)
        view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        host.didMove(toParent: self)
        nativeHost = host
    }

    private func dismissNativeExperience() {
        guard let host = nativeHost else { return }
        host.willMove(toParent: nil)
        host.view.removeFromSuperview()
        host.removeFromParent()
        nativeHost = nil
    }
}

@objc(NavaAuthViewportPlugin)
final class NavaAuthViewportPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NavaAuthViewportPlugin"
    let jsName = "NavaAuthViewport"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc func setEnabled(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController as? NavaBridgeViewController else {
                call.reject("Authentication canvas is unavailable.")
                return
            }
            call.resolve(controller.setAuthViewportEnabled(
                call.getBool("enabled") ?? false,
                keepRootPinned: call.getBool("keepRootPinned") ?? true
            ))
        }
    }
}

/// Uses Apple's system authorization sheet and returns the ID token plus the
/// un-hashed nonce. Supabase validates both before creating a NAVA session.
@objc(NavaAppleSignInPlugin)
final class NavaAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin,
    ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    let identifier = "NavaAppleSignInPlugin"
    let jsName = "NavaAppleSignIn"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var pendingNonce: String?

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("Apple sign-in is already active.", "APPLE_SIGN_IN_ACTIVE")
                return
            }

            let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "")
                + UUID().uuidString.replacingOccurrences(of: "-", with: "")
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = Self.sha256(nonce)
            self.pendingCall = call
            self.pendingNonce = nonce

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8),
              let call = pendingCall,
              let nonce = pendingNonce else {
            finishWithError("Apple did not return a valid identity token.", code: "APPLE_ID_TOKEN_MISSING")
            return
        }

        var result: [String: Any] = [
            "identityToken": identityToken,
            "nonce": nonce,
            "user": credential.user
        ]
        if let email = credential.email { result["email"] = email }
        if let givenName = credential.fullName?.givenName { result["givenName"] = givenName }
        if let familyName = credential.fullName?.familyName { result["familyName"] = familyName }

        pendingCall = nil
        pendingNonce = nil
        call.resolve(result)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let authorizationError = error as? ASAuthorizationError
        let cancelled = authorizationError?.code == .canceled
        finishWithError(
            cancelled ? "Apple sign-in was cancelled." : "Apple sign-in failed.",
            code: cancelled ? "SOCIAL_AUTH_CANCELLED" : "SOCIAL_AUTH_FAILED",
            error: error
        )
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    private func finishWithError(_ message: String, code: String, error: Error? = nil) {
        let call = pendingCall
        pendingCall = nil
        pendingNonce = nil
        call?.reject(message, code, error)
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

/// Keeps regional OAuth credentials out of WKWebView and captures the custom
/// callback in an iOS-owned authentication session.
@objc(NavaExternalAuthPlugin)
final class NavaExternalAuthPlugin: CAPPlugin, CAPBridgedPlugin,
    ASWebAuthenticationPresentationContextProviding {
    let identifier = "NavaExternalAuthPlugin"
    let jsName = "NavaExternalAuth"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var activeSession: ASWebAuthenticationSession?
    private var activeCall: CAPPluginCall?

    @objc func start(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let url = URL(string: address),
              let callbackScheme = call.getString("callbackScheme"), callbackScheme == "nava" else {
            call.reject("Invalid external authentication request.", "SOCIAL_AUTH_FAILED")
            return
        }

        DispatchQueue.main.async {
            guard self.activeSession == nil else {
                call.reject("External authentication is already active.", "SOCIAL_AUTH_ACTIVE")
                return
            }

            self.activeCall = call
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callbackUrl, error in
                guard let self else { return }
                let pendingCall = self.activeCall
                self.activeCall = nil
                self.activeSession = nil
                if let callbackUrl {
                    pendingCall?.resolve(["callbackUrl": callbackUrl.absoluteString])
                    return
                }
                let authenticationError = error as? ASWebAuthenticationSessionError
                let cancelled = authenticationError?.code == .canceledLogin
                pendingCall?.reject(
                    cancelled ? "Social sign-in was cancelled." : "Social sign-in failed.",
                    cancelled ? "SOCIAL_AUTH_CANCELLED" : "SOCIAL_AUTH_FAILED",
                    error
                )
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.activeSession = session
            if !session.start() {
                self.activeSession = nil
                self.activeCall = nil
                call.reject("Unable to start external authentication.", "SOCIAL_AUTH_FAILED")
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

private final class NavaWeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

private enum NavaNativeFeatureFlag {
    static var isEnabled: Bool {
        if ProcessInfo.processInfo.arguments.contains("-NavaNativeUI") { return true }
        if ProcessInfo.processInfo.environment["NAVA_NATIVE_UI"] == "1" { return true }
        return Bundle.main.object(forInfoDictionaryKey: "NavaNativeUIEnabled") as? Bool ?? false
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
