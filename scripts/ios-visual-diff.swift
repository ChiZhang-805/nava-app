#!/usr/bin/env swift

import AppKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct VisualDiffMetrics: Codable {
    let width: Int
    let height: Int
    let changedPixelRatio: Double
    let meanAbsoluteError: Double
    let maximumChannelError: Double
    let changedPixelRatioLimit: Double
    let meanAbsoluteErrorLimit: Double
    let passed: Bool
}

enum VisualDiffError: Error, CustomStringConvertible {
    case usage
    case unreadableImage(String)
    case sizeMismatch(CGSize, CGSize)
    case bitmapCreation
    case pngWrite(String)

    var description: String {
        switch self {
        case .usage:
            return "usage: swift ios-visual-diff.swift <baseline.png> <actual.png> <output-directory> [changed-ratio-limit] [mean-error-limit]"
        case .unreadableImage(let path):
            return "unable to read image: \(path)"
        case .sizeMismatch(let baseline, let actual):
            return "image sizes differ: baseline \(Int(baseline.width))x\(Int(baseline.height)), actual \(Int(actual.width))x\(Int(actual.height))"
        case .bitmapCreation:
            return "unable to create RGBA bitmap"
        case .pngWrite(let path):
            return "unable to write PNG: \(path)"
        }
    }
}

func loadCGImage(_ path: String) throws -> CGImage {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw VisualDiffError.unreadableImage(path)
    }
    return image
}

func rgbaBytes(_ image: CGImage) throws -> [UInt8] {
    let width = image.width
    let height = image.height
    let bytesPerRow = width * 4
    var bytes = [UInt8](repeating: 0, count: bytesPerRow * height)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        .union(.byteOrder32Big)

    let drewImage = bytes.withUnsafeMutableBytes { storage -> Bool in
        guard let context = CGContext(
            data: storage.baseAddress,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: bitmapInfo.rawValue
        ) else {
            return false
        }
        context.interpolationQuality = .none
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return true
    }
    guard drewImage else { throw VisualDiffError.bitmapCreation }
    return bytes
}

func writePNG(_ bytes: [UInt8], width: Int, height: Int, path: String) throws {
    let data = Data(bytes)
    guard let provider = CGDataProvider(data: data as CFData),
          let image = CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue).union(.byteOrder32Big),
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
          ) else {
        throw VisualDiffError.bitmapCreation
    }

    let url = URL(fileURLWithPath: path)
    guard let destination = CGImageDestinationCreateWithURL(
        url as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        throw VisualDiffError.pngWrite(path)
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw VisualDiffError.pngWrite(path)
    }
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count >= 4 else { throw VisualDiffError.usage }

    let baselinePath = arguments[1]
    let actualPath = arguments[2]
    let outputDirectory = arguments[3]
    let changedRatioLimit = arguments.count > 4 ? Double(arguments[4]) ?? 0.015 : 0.015
    let meanErrorLimit = arguments.count > 5 ? Double(arguments[5]) ?? 0.012 : 0.012

    let baselineImage = try loadCGImage(baselinePath)
    let actualImage = try loadCGImage(actualPath)
    guard baselineImage.width == actualImage.width, baselineImage.height == actualImage.height else {
        throw VisualDiffError.sizeMismatch(
            CGSize(width: baselineImage.width, height: baselineImage.height),
            CGSize(width: actualImage.width, height: actualImage.height)
        )
    }

    let baseline = try rgbaBytes(baselineImage)
    let actual = try rgbaBytes(actualImage)
    var diff = [UInt8](repeating: 0, count: baseline.count)
    var overlay = [UInt8](repeating: 0, count: baseline.count)
    var changedPixels = 0
    var totalAbsoluteError: UInt64 = 0
    var maximumChannelError = 0
    let pixelCount = baselineImage.width * baselineImage.height
    let changedThreshold = 12

    for offset in stride(from: 0, to: baseline.count, by: 4) {
        var pixelMaximum = 0
        for channel in 0..<3 {
            let delta = abs(Int(baseline[offset + channel]) - Int(actual[offset + channel]))
            pixelMaximum = max(pixelMaximum, delta)
            maximumChannelError = max(maximumChannelError, delta)
            totalAbsoluteError += UInt64(delta)
            diff[offset + channel] = UInt8(min(255, delta * 4))
            overlay[offset + channel] = UInt8((Int(baseline[offset + channel]) + Int(actual[offset + channel])) / 2)
        }
        if pixelMaximum > changedThreshold { changedPixels += 1 }
        diff[offset + 3] = 255
        overlay[offset + 3] = 255
    }

    try FileManager.default.createDirectory(
        at: URL(fileURLWithPath: outputDirectory),
        withIntermediateDirectories: true
    )
    try writePNG(diff, width: baselineImage.width, height: baselineImage.height, path: "\(outputDirectory)/diff.png")
    try writePNG(overlay, width: baselineImage.width, height: baselineImage.height, path: "\(outputDirectory)/overlay.png")

    let changedPixelRatio = Double(changedPixels) / Double(pixelCount)
    let meanAbsoluteError = Double(totalAbsoluteError) / Double(pixelCount * 3 * 255)
    let passed = changedPixelRatio <= changedRatioLimit && meanAbsoluteError <= meanErrorLimit
    let metrics = VisualDiffMetrics(
        width: baselineImage.width,
        height: baselineImage.height,
        changedPixelRatio: changedPixelRatio,
        meanAbsoluteError: meanAbsoluteError,
        maximumChannelError: Double(maximumChannelError) / 255,
        changedPixelRatioLimit: changedRatioLimit,
        meanAbsoluteErrorLimit: meanErrorLimit,
        passed: passed
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(metrics).write(to: URL(fileURLWithPath: "\(outputDirectory)/metrics.json"))

    print("changedPixelRatio=\(changedPixelRatio) meanAbsoluteError=\(meanAbsoluteError) passed=\(passed)")
    if !passed { exit(2) }
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
