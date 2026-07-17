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
        let resultQueue = DispatchQueue(label: "app.nava.health.result")

        if let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) {
            group.enter()
            queryCumulative(type: stepsType, unit: .count(), start: start, end: end) { value in
                resultQueue.sync { result["steps"] = value }
                group.leave()
            }
        }

        if let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
            group.enter()
            queryCumulative(type: energyType, unit: .kilocalorie(), start: start, end: end) { value in
                resultQueue.sync { result["activeEnergyKcal"] = value }
                group.leave()
            }
        }

        if let exerciseType = HKObjectType.quantityType(forIdentifier: .appleExerciseTime) {
            group.enter()
            queryCumulative(type: exerciseType, unit: .minute(), start: start, end: end) { value in
                resultQueue.sync { result["exerciseMinutes"] = value }
                group.leave()
            }
        }

        if let heartType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            group.enter()
            queryLatest(type: heartType, unit: HKUnit.count().unitDivided(by: .minute()), start: start, end: end) { value in
                resultQueue.sync { result["latestHeartRate"] = value }
                group.leave()
            }
        }

        if let restingHeartType = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            group.enter()
            queryLatest(type: restingHeartType, unit: HKUnit.count().unitDivided(by: .minute()), start: start, end: end) { value in
                resultQueue.sync { result["restingHeartRate"] = value }
                group.leave()
            }
        }

        if let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            group.enter()
            queryLatest(type: hrvType, unit: HKUnit.secondUnit(with: .milli), start: start, end: end) { value in
                resultQueue.sync { result["heartRateVariabilitySDNN"] = value }
                group.leave()
            }
        }

        if let oxygenType = HKObjectType.quantityType(forIdentifier: .oxygenSaturation) {
            group.enter()
            queryLatest(type: oxygenType, unit: .percent(), start: start, end: end) { value in
                resultQueue.sync { result["latestBloodOxygen"] = value }
                group.leave()
            }
        }

        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            querySleep(type: sleepType, start: start, end: end) { total, stages in
                resultQueue.sync {
                    result["sleepMinutes"] = total
                    result["sleepStageMinutes"] = stages
                }
                group.leave()
            }
        }

        group.enter()
        queryHourlyActivity(start: start, end: end) { bins in
            resultQueue.sync { result["activityBins"] = bins }
            group.leave()
        }

        group.notify(queue: .main) {
            resultQueue.sync {
                call.resolve(result)
            }
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
        start: Date,
        end: Date,
        completion: @escaping (Double?) -> Void
    ) {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictEndDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            guard let sample = samples?.first as? HKQuantitySample else {
                completion(nil)
                return
            }
            completion(sample.quantity.doubleValue(for: unit))
        }
        healthStore.execute(query)
    }

    private func querySleep(
        type: HKCategoryType,
        start: Date,
        end: Date,
        completion: @escaping (Double, [String: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            var stages: [String: Double] = [:]
            let minutes = (samples ?? []).compactMap { $0 as? HKCategorySample }.reduce(0.0) { total, sample in
                let duration = sample.endDate.timeIntervalSince(sample.startDate) / 60.0
                let isAwake = sample.value == HKCategoryValueSleepAnalysis.awake.rawValue
                let isInBed = sample.value == HKCategoryValueSleepAnalysis.inBed.rawValue
                if isAwake {
                    stages["awake", default: 0] += duration
                    return total
                }
                if isInBed {
                    stages["inBed", default: 0] += duration
                    return total
                }
                if #available(iOS 16.0, *) {
                    if sample.value == HKCategoryValueSleepAnalysis.asleepREM.rawValue {
                        stages["rem", default: 0] += duration
                    } else if sample.value == HKCategoryValueSleepAnalysis.asleepCore.rawValue {
                        stages["core", default: 0] += duration
                    } else if sample.value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue {
                        stages["deep", default: 0] += duration
                    } else {
                        stages["asleep", default: 0] += duration
                    }
                } else {
                    stages["asleep", default: 0] += duration
                }
                return total + duration
            }
            completion(minutes, stages)
        }
        healthStore.execute(query)
    }

    private func queryHourlyActivity(
        start: Date,
        end: Date,
        completion: @escaping ([[String: Any]]) -> Void
    ) {
        let group = DispatchGroup()
        var steps: [Date: Double] = [:]
        var energy: [Date: Double] = [:]
        var exercise: [Date: Double] = [:]
        let writeQueue = DispatchQueue(label: "app.nava.health.hourly")

        if let type = HKObjectType.quantityType(forIdentifier: .stepCount) {
            group.enter()
            queryHourlyCumulative(type: type, unit: .count(), start: start, end: end) { values in
                writeQueue.sync { steps = values }
                group.leave()
            }
        }

        if let type = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
            group.enter()
            queryHourlyCumulative(type: type, unit: .kilocalorie(), start: start, end: end) { values in
                writeQueue.sync { energy = values }
                group.leave()
            }
        }

        if let type = HKObjectType.quantityType(forIdentifier: .appleExerciseTime) {
            group.enter()
            queryHourlyCumulative(type: type, unit: .minute(), start: start, end: end) { values in
                writeQueue.sync { exercise = values }
                group.leave()
            }
        }

        group.notify(queue: .global(qos: .userInitiated)) {
            let calendar = Calendar.current
            let bins = (0..<24).map { hour -> [String: Any] in
                let binStart = calendar.date(byAdding: .hour, value: hour, to: start) ?? start
                let binEnd = calendar.date(byAdding: .hour, value: 1, to: binStart) ?? binStart
                return [
                    "hour": hour,
                    "start": ISO8601DateFormatter().string(from: binStart),
                    "end": ISO8601DateFormatter().string(from: binEnd),
                    "steps": steps[binStart] ?? 0,
                    "activeEnergyKcal": energy[binStart] ?? 0,
                    "exerciseMinutes": exercise[binStart] ?? 0
                ]
            }
            completion(bins)
        }
    }

    private func queryHourlyCumulative(
        type: HKQuantityType,
        unit: HKUnit,
        start: Date,
        end: Date,
        completion: @escaping ([Date: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsCollectionQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum,
            anchorDate: start,
            intervalComponents: DateComponents(hour: 1)
        )
        query.initialResultsHandler = { _, collection, _ in
            var values: [Date: Double] = [:]
            collection?.enumerateStatistics(from: start, to: end) { statistics, _ in
                values[statistics.startDate] = statistics.sumQuantity()?.doubleValue(for: unit) ?? 0
            }
            completion(values)
        }
        healthStore.execute(query)
    }
}
