import AVFoundation
import SwiftUI
import UIKit

final class NavaFoodCameraService: NSObject, ObservableObject {
    let session = AVCaptureSession()
    @Published private(set) var isReady = false
    @Published private(set) var authorizationDenied = false

    private let output = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "health.nava.mobile.food-camera", qos: .userInitiated)
    private var captureContinuation: CheckedContinuation<CGImage, Error>?

    func prepare() async {
        let allowed: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            allowed = true
        case .notDetermined:
            allowed = await AVCaptureDevice.requestAccess(for: .video)
        default:
            allowed = false
        }

        guard allowed else {
            await MainActor.run { authorizationDenied = true }
            return
        }

        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                sessionQueue.async { [weak self] in
                    guard let self else {
                        continuation.resume(throwing: NavaFoodScanError.cameraUnavailable)
                        return
                    }
                    do {
                        try self.configureSession()
                        self.session.startRunning()
                        continuation.resume()
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
            }
            await MainActor.run { isReady = true }
        } catch {
            await MainActor.run { isReady = false }
        }
    }

    func stop() {
        guard session.isRunning else { return }
        sessionQueue.async { [weak self] in self?.session.stopRunning() }
    }

    func capture() async throws -> CGImage {
        guard isReady else { throw NavaFoodScanError.cameraUnavailable }
        return try await withCheckedThrowingContinuation { continuation in
            guard captureContinuation == nil else {
                continuation.resume(throwing: NavaFoodScanError.captureFailed)
                return
            }
            captureContinuation = continuation
            let settings = AVCapturePhotoSettings()
            settings.photoQualityPrioritization = .quality
            output.capturePhoto(with: settings, delegate: self)
        }
    }

    private func configureSession() throws {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo

        guard session.inputs.isEmpty, session.outputs.isEmpty else { return }
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            throw NavaFoodScanError.cameraUnavailable
        }
        let input = try AVCaptureDeviceInput(device: camera)
        guard session.canAddInput(input), session.canAddOutput(output) else {
            throw NavaFoodScanError.cameraUnavailable
        }
        session.addInput(input)
        session.addOutput(output)
    }
}

extension NavaFoodCameraService: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        Task { @MainActor [weak self] in
            guard let self, let continuation = self.captureContinuation else { return }
            self.captureContinuation = nil
            if let error {
                continuation.resume(throwing: error)
                return
            }
            guard let data = photo.fileDataRepresentation(),
                  let image = UIImage(data: data),
                  let cgImage = image.normalizedCGImage else {
                continuation.resume(throwing: NavaFoodScanError.captureFailed)
                return
            }
            continuation.resume(returning: cgImage)
        }
    }
}

private extension UIImage {
    var normalizedCGImage: CGImage? {
        if imageOrientation == .up { return cgImage }
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: size)) }.cgImage
    }
}

struct NavaCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> NavaCameraPreviewView {
        let view = NavaCameraPreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: NavaCameraPreviewView, context: Context) {
        uiView.previewLayer.session = session
    }
}

final class NavaCameraPreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

