import Foundation
import HealthKit

extension Notification.Name {
    static let navaHealthDataDidChange = Notification.Name("NavaHealthDataDidChange")
}

/**
 * Registers HealthKit observer queries as early as app launch. A background callback is made
 * durable in UserDefaults before HealthKit's completion handler is called. The JS bridge can
 * sync immediately while alive, or consume the pending marker on the next foreground launch.
 */
final class NavaHealthBackgroundObserver {
    static let shared = NavaHealthBackgroundObserver()

    private let healthStore = HKHealthStore()
    private let stateQueue = DispatchQueue(label: "health.nava.background-observer")
    private let pendingKey = "nava.health.background.pending"
    private let pendingAtKey = "nava.health.background.pending-at"
    private let pendingTypesKey = "nava.health.background.pending-types"
    private var observerQueries: [HKObserverQuery] = []
    private var observersStarted = false

    private var observedTypes: [HKSampleType] {
        [
            HKObjectType.quantityType(forIdentifier: .stepCount),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
            HKObjectType.quantityType(forIdentifier: .appleExerciseTime),
            HKObjectType.quantityType(forIdentifier: .heartRate),
            HKObjectType.quantityType(forIdentifier: .restingHeartRate),
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN),
            HKObjectType.quantityType(forIdentifier: .oxygenSaturation),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        ].compactMap { $0 }
    }

    private init() {}

    func start(completion: ((Bool, [String]) -> Void)? = nil) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion?(false, ["HealthKit is unavailable"])
            return
        }

        stateQueue.async {
            if !self.observersStarted {
                self.observerQueries = self.observedTypes.map { sampleType in
                    let query = HKObserverQuery(sampleType: sampleType, predicate: nil) { _, finish, error in
                        defer { finish() }
                        guard error == nil else { return }
                        self.recordPendingChange(typeIdentifier: sampleType.identifier)
                    }
                    self.healthStore.execute(query)
                    return query
                }
                self.observersStarted = true
            }

            let group = DispatchGroup()
            let errorQueue = DispatchQueue(label: "health.nava.background-delivery-errors")
            var errors: [String] = []
            for sampleType in self.observedTypes {
                group.enter()
                self.healthStore.enableBackgroundDelivery(for: sampleType, frequency: .hourly) { success, error in
                    if !success {
                        errorQueue.sync {
                            errors.append(error?.localizedDescription ?? "Unable to enable \(sampleType.identifier)")
                        }
                    }
                    group.leave()
                }
            }
            group.notify(queue: .main) {
                completion?(errors.isEmpty, errors)
            }
        }
    }

    func readPendingChange() -> [String: Any] {
        stateQueue.sync {
            let defaults = UserDefaults.standard
            let pending = defaults.bool(forKey: pendingKey)
            let occurredAt = defaults.string(forKey: pendingAtKey)
            let types = defaults.stringArray(forKey: pendingTypesKey) ?? []
            return [
                "pending": pending,
                "occurredAt": occurredAt ?? "",
                "types": types
            ]
        }
    }

    func acknowledgePendingChange(through: Date?) {
        stateQueue.sync {
            let defaults = UserDefaults.standard
            if let through = through,
               let pendingAt = defaults.string(forKey: pendingAtKey),
               let pendingDate = parseIsoDate(pendingAt),
               pendingDate > through {
                return
            }
            defaults.removeObject(forKey: pendingKey)
            defaults.removeObject(forKey: pendingAtKey)
            defaults.removeObject(forKey: pendingTypesKey)
        }
    }

    private func parseIsoDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func recordPendingChange(typeIdentifier: String) {
        // HealthKit's completion handler is called only after this synchronous block
        // returns, so the pending marker survives process suspension after the callback.
        stateQueue.sync {
            let defaults = UserDefaults.standard
            var types = Set(defaults.stringArray(forKey: self.pendingTypesKey) ?? [])
            types.insert(typeIdentifier)
            let occurredAt = ISO8601DateFormatter().string(from: Date())
            defaults.set(true, forKey: self.pendingKey)
            defaults.set(occurredAt, forKey: self.pendingAtKey)
            defaults.set(Array(types).sorted(), forKey: self.pendingTypesKey)
            NotificationCenter.default.post(
                name: .navaHealthDataDidChange,
                object: nil,
                userInfo: ["occurredAt": occurredAt, "types": Array(types).sorted()]
            )
        }
    }
}
