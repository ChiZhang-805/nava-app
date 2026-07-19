import Foundation
import SwiftUI

struct WatchHomeView: View {
    var body: some View {
        TabView {
            RhythmPage()
            MoodPage()
            FocusPage()
        }
    }
}

private struct RhythmPage: View {
    @EnvironmentObject private var session: WatchSessionManager

    private var today: [String: Any] {
        session.latestSnapshot["today"] as? [String: Any] ?? [:]
    }

    private var score: Int? {
        if let value = today["rhythmScore"] as? Int { return value }
        if let value = today["rhythmScore"] as? Double { return Int(value.rounded()) }
        return nil
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("NAVA")
                    .font(.system(size: 17, weight: .black, design: .serif))
                Spacer()
                Circle()
                    .fill(session.reachable ? Color.green : Color.orange)
                    .frame(width: 7, height: 7)
                    .accessibilityLabel(Text(LocalizedStringKey(session.reachable ? "watch.connected" : "watch.queued")))
            }

            if let score {
                Text("\(score)")
                    .font(.system(size: 52, weight: .light, design: .rounded))
                    .monospacedDigit()
                Text("watch.rhythm")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Image(systemName: "waveform.path.ecg")
                    .font(.system(size: 38, weight: .light))
                Text("watch.awaiting")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button {
                session.sendAction([
                    "type": "sync.requestSnapshot",
                    "recordedAt": ISO8601DateFormatter().string(from: Date())
                ])
            } label: {
                Label("watch.sync", systemImage: "arrow.triangle.2.circlepath")
            }
            .buttonStyle(.bordered)
            .tint(.cyan)
        }
        .padding(.horizontal, 4)
    }
}

private struct MoodPage: View {
    private struct MoodOption: Identifiable {
        let id: Int
        let icon: String
    }

    @EnvironmentObject private var session: WatchSessionManager
    @State private var selectedMood: Int?

    private let moods = [
        MoodOption(id: 20, icon: "cloud.rain"),
        MoodOption(id: 40, icon: "cloud"),
        MoodOption(id: 60, icon: "cloud.sun"),
        MoodOption(id: 80, icon: "sun.min"),
        MoodOption(id: 100, icon: "sun.max")
    ]

    var body: some View {
        VStack(spacing: 9) {
            Text("watch.mood")
                .font(.headline)

            HStack(spacing: 5) {
                ForEach(moods) { option in
                    let mood = option.id
                    let icon = option.icon
                    Button {
                        selectedMood = mood
                        session.sendAction([
                            "type": "mood.quickLog",
                            "mood": mood,
                            "recordedAt": ISO8601DateFormatter().string(from: Date())
                        ])
                    } label: {
                        Image(systemName: selectedMood == mood ? "checkmark" : icon)
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 26, height: 34)
                    }
                    .buttonStyle(.bordered)
                    .tint(selectedMood == mood ? Color.cyan : Color.blue.opacity(0.55))
                    .accessibilityLabel(Text("\(mood)"))
                }
            }

            Text(LocalizedStringKey(selectedMood == nil ? "watch.chooseMood" : "watch.saved"))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

private struct FocusPage: View {
    @EnvironmentObject private var session: WatchSessionManager
    @AppStorage("nava.watch.focusStartedAt") private var focusStartedAt = 0.0
    @AppStorage("nava.watch.focusSessionId") private var focusSessionId = ""

    private var isRunning: Bool { focusStartedAt > 0 }

    var body: some View {
        VStack(spacing: 9) {
            Text("watch.focus")
                .font(.headline)

            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(elapsedText(at: context.date))
                    .font(.system(size: 34, weight: .medium, design: .rounded))
                    .monospacedDigit()
            }

            Button(action: isRunning ? stop : start) {
                Label {
                    Text(LocalizedStringKey(isRunning ? "watch.stop" : "watch.start"))
                } icon: {
                    Image(systemName: isRunning ? "stop.fill" : "play.fill")
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(isRunning ? .orange : .cyan)
        }
    }

    private func elapsedText(at date: Date) -> String {
        guard isRunning else { return "00:00" }
        let seconds = max(0, Int(date.timeIntervalSince1970 - focusStartedAt))
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    private func start() {
        let now = Date()
        focusStartedAt = now.timeIntervalSince1970
        focusSessionId = UUID().uuidString.lowercased()
        session.sendAction([
            "type": "focus.start",
            "sessionId": focusSessionId,
            "startedAt": ISO8601DateFormatter().string(from: now)
        ])
    }

    private func stop() {
        let now = Date()
        let minutes = max(1, Int(((now.timeIntervalSince1970 - focusStartedAt) / 60).rounded()))
        session.sendAction([
            "type": "focus.stop",
            "sessionId": focusSessionId,
            "endedAt": ISO8601DateFormatter().string(from: now),
            "durationMinutes": minutes
        ])
        focusStartedAt = 0
        focusSessionId = ""
    }
}
