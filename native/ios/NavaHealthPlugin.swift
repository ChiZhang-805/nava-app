import Foundation
import Capacitor
import HealthKit

@objc(NavaHealthPlugin)
public class NavaHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NavaHealthPlugin"
    public let jsName = "NavaHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTodaySummary", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        [
            HKObjectType.quantityType(forIdentifier: .stepCount),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
            HKObjectType.quantityType(forIdentifier: .appleExerciseTime),
            HKObjectType.quantityType(forIdentifier: .heartRate),
            HKObjectType.quantityType(forIdentifier: .restingHeartRate),
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN),
            HKObjectType.quantityType(forIdentifier: .oxygenSaturation),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        ].compactMap { $0 }.forEach { types.insert($0) }
        return types
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit is not available on this device")
            return
        }

        healthStore.requestAuthorization(toShare: [], read: readTypes) { success, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": success])
        }
    }

    @objc func getTodaySummary(_ call: CAPPluginCall) {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: Date())
        let end = Date()

        var result: [String: Any] = [:]
        let group = DispatchGroup()

        if let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) {
            group.enter()
            queryCumulative(type: stepsType, unit: .count(), start: start, end: end) { value in
                result["steps"] = value
                group.leave()
            }
        }

        if let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
            group.enter()
            queryCumulative(type: energyType, unit: .kilocalorie(), start: start, end: end) { value in
                result["activeEnergyKcal"] = value
                group.leave()
            }
        }

        if let exerciseType = HKObjectType.quantityType(forIdentifier: .appleExerciseTime) {
            group.enter()
            queryCumulative(type: exerciseType, unit: .minute(), start: start, end: end) { value in
                result["exerciseMinutes"] = value
                group.leave()
            }
        }

        if let heartType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            group.enter()
            queryLatest(type: heartType, unit: HKUnit.count().unitDivided(by: .minute())) { value in
                result["latestHeartRate"] = value
                group.leave()
            }
        }

        if let restingHeartType = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            group.enter()
            queryLatest(type: restingHeartType, unit: HKUnit.count().unitDivided(by: .minute())) { value in
                result["restingHeartRate"] = value
                group.leave()
            }
        }

        if let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            group.enter()
            queryLatest(type: hrvType, unit: HKUnit.secondUnit(with: .milli)) { value in
                result["heartRateVariabilitySDNN"] = value
                group.leave()
            }
        }

        if let oxygenType = HKObjectType.quantityType(forIdentifier: .oxygenSaturation) {
            group.enter()
            queryLatest(type: oxygenType, unit: .percent()) { value in
                result["latestBloodOxygen"] = value
                group.leave()
            }
        }

        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            querySleepMinutes(type: sleepType, start: start, end: end) { value in
                result["sleepMinutes"] = value
                group.leave()
            }
        }

        group.notify(queue: .main) {
            call.resolve(result)
        }
    }

    private func queryCumulative(
        type: HKQuantityType,
        unit: HKUnit,
        start: Date,
        end: Date,
        completion: @escaping (Double) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, _ in
            let value = statistics?.sumQuantity()?.doubleValue(for: unit) ?? 0
            completion(value)
        }
        healthStore.execute(query)
    }

    private func queryLatest(
        type: HKQuantityType,
        unit: HKUnit,
        completion: @escaping (Double?) -> Void
    ) {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            guard let sample = samples?.first as? HKQuantitySample else {
                completion(nil)
                return
            }
            completion(sample.quantity.doubleValue(for: unit))
        }
        healthStore.execute(query)
    }

    private func querySleepMinutes(
        type: HKCategoryType,
        start: Date,
        end: Date,
        completion: @escaping (Double) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            let minutes = (samples ?? []).compactMap { $0 as? HKCategorySample }.reduce(0.0) { total, sample in
                let isAwake = sample.value == HKCategoryValueSleepAnalysis.awake.rawValue
                let isInBed = sample.value == HKCategoryValueSleepAnalysis.inBed.rawValue
                if isAwake || isInBed { return total }
                return total + sample.endDate.timeIntervalSince(sample.startDate) / 60.0
            }
            completion(minutes)
        }
        healthStore.execute(query)
    }
}
