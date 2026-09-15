import AVFoundation
import Capacitor
import Speech
import UIKit

@objc(NavaSpeechPlugin)
public class NavaSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NavaSpeechPlugin"
    public let jsName = "NavaSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelListening", returnType: CAPPluginReturnPromise)
    ]

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var isListening = false
    private var pendingStart = false
    private var installedTap = false
    private var generation = 0

    public override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(audioRouteChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appBackgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func audioInterrupted(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        interruptRecognition()
    }

    @objc private func audioRouteChanged(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        interruptRecognition()
    }

    @objc private func appBackgrounded() { interruptRecognition() }

    private func interruptRecognition() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isListening || self.pendingStart else { return }
            self.notifyListeners("speechError", data: ["code": "voice_interrupted", "message": "Recording interrupted. Recognized text is kept; restart manually."])
            self.finishRecognition(cancel: true)
        }
    }

    @objc func startListening(_ call: CAPPluginCall) {
        let locale = call.getString("locale") ?? "zh-CN"
        DispatchQueue.main.async {
            self.finishRecognition(cancel: true, notify: false)
            let requestGeneration = self.generation
            self.pendingStart = true
            self.requestPermissions { [weak self] granted, reason in
                guard let self else { return }
                DispatchQueue.main.async {
                    guard self.generation == requestGeneration, self.pendingStart, UIApplication.shared.applicationState != .background else {
                        if self.generation == requestGeneration { self.finishRecognition(cancel: true) }
                        call.reject("Recording request cancelled.", "voice_interrupted")
                        return
                    }
                    self.pendingStart = false
                    guard granted else {
                        call.reject(reason ?? "Speech recognition permission was denied.", "permission_denied")
                        return
                    }
                    do {
                        try self.beginRecognition(locale: locale, requestGeneration: requestGeneration)
                        call.resolve(["listening": true])
                    } catch {
                        self.finishRecognition(cancel: true)
                        call.reject(error.localizedDescription, "voice_failed")
                    }
                }
            }
        }
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finishRecognition(cancel: false)
            call.resolve()
        }
    }

    @objc func cancelListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finishRecognition(cancel: true)
            call.resolve()
        }
    }

    private func requestPermissions(completion: @escaping (Bool, String?) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                completion(false, "Speech recognition permission was denied.")
                return
            }

            let microphoneResult: (Bool) -> Void = { granted in
                completion(granted, granted ? nil : "Microphone permission was denied.")
            }
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission(completionHandler: microphoneResult)
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission(microphoneResult)
            }
        }
    }

    private func beginRecognition(locale: String, requestGeneration: Int) throws {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.isAvailable else {
            throw NSError(domain: "NavaSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: "Speech recognition is unavailable for this language."])
        }

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else {
            throw NSError(domain: "NavaSpeech", code: 2, userInfo: [NSLocalizedDescriptionKey: "No microphone input is available."])
        }
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        installedTap = true

        audioEngine.prepare()
        try audioEngine.start()
        isListening = true
        notifyListeners("speechState", data: ["listening": true])

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            DispatchQueue.main.async {
                guard self.generation == requestGeneration, self.isListening else { return }
                if let result {
                    self.notifyListeners("speechResult", data: [
                        "transcript": result.bestTranscription.formattedString,
                        "isFinal": result.isFinal
                    ])
                    if result.isFinal {
                        self.finishRecognition(cancel: false)
                        return
                    }
                }
                if let error {
                    self.notifyListeners("speechError", data: [
                        "code": "voice_failed",
                        "message": error.localizedDescription
                    ])
                    self.finishRecognition(cancel: true)
                }
            }
        }
    }

    private func finishRecognition(cancel: Bool, notify: Bool = true) {
        let wasListening = isListening || pendingStart
        generation += 1
        pendingStart = false
        isListening = false

        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if installedTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            installedTap = false
        }
        recognitionRequest?.endAudio()
        if cancel {
            recognitionTask?.cancel()
        } else {
            recognitionTask?.finish()
        }
        recognitionRequest = nil
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        if notify && wasListening {
            notifyListeners("speechState", data: ["listening": false])
        }
    }
}
