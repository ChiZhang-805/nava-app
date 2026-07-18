import Foundation
import Capacitor
import HealthKit

@objc(NavaHealthPlugin)
public class NavaHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NavaHealthPlugin"
    public let jsName = "NavaHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTodaySummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRecentSummaries", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private let isoFormatter = ISO8601DateFormatter()

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
        let dayStart = calendar.startOfDay(for: Date())
        queryDailySummary(dayStart: dayStart, activityEnd: Date()) { summary in
            DispatchQueue.main.async { call.resolve(summary) }
        }
    }

    @objc func getRecentSummaries(_ call: CAPPluginCall) {
        let requestedDays = call.getInt("days") ?? 14
        let days = min(31, max(1, requestedDays))
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let group = DispatchGroup()
        let resultQueue = DispatchQueue(label: "app.nava.health.recent-results")
        var summaries: [[String: Any]] = []

        for offset in stride(from: days - 1, through: 0, by: -1) {
            guard let dayStart = calendar.date(byAdding: .day, value: -offset, to: today),
                  let nextDay = calendar.date(byAdding: .day, value: 1, to: dayStart) else { continue }
            let activityEnd = offset == 0 ? Date() : nextDay
            group.enter()
            queryDailySummary(dayStart: dayStart, activityEnd: activityEnd) { summary in
                resultQueue.sync { summaries.append(summary) }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            let ordered = summaries.sorted { String(describing: $0["date"] ?? "") < String(describing: $1["date"] ?? "") }
            call.resolve(["summaries": ordered])
        }
    }

    private func queryDailySummary(dayStart: Date, activityEnd: Date, completion: @escaping ([String: Any]) -> Void) {
        let calendar = Calendar.current
        let sleepWindowStart = calendar.date(byAdding: .hour, value: -12, to: dayStart) ?? dayStart
        let nominalSleepEnd = calendar.date(byAdding: .hour, value: 12, to: dayStart) ?? activityEnd
        let sleepWindowEnd = min(Date(), nominalSleepEnd)
        let resultQueue = DispatchQueue(label: "app.nava.health.daily-result")
        let group = DispatchGroup()
        var result: [String: Any] = [
            "date": localDateString(dayStart),
            "source": "apple_health",
            "timezoneOffsetMinutes": TimeZone.current.secondsFromGMT(for: dayStart) / 60
        ]

        queryCumulativeField(.stepCount, unit: .count(), start: dayStart, end: activityEnd, group: group) { value in resultQueue.sync { result["steps"] = value } }
        queryCumulativeField(.activeEnergyBurned, unit: .kilocalorie(), start: dayStart, end: activityEnd, group: group) { value in resultQueue.sync { result["activeEnergyKcal"] = value } }
        queryCumulativeField(.appleExerciseTime, unit: .minute(), start: dayStart, end: activityEnd, group: group) { value in resultQueue.sync { result["exerciseMinutes"] = value } }
        queryLatestField(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: dayStart, end: activityEnd, group: group) { value in if let value = value { resultQueue.sync { result["latestHeartRate"] = value } } }
        queryLatestField(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: dayStart, end: activityEnd, group: group) { value in if let value = value { resultQueue.sync { result["restingHeartRate"] = value } } }
        queryLatestField(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli), start: dayStart, end: activityEnd, group: group) { value in if let value = value { resultQueue.sync { result["heartRateVariabilitySDNN"] = value } } }
        queryLatestField(.oxygenSaturation, unit: .percent(), start: dayStart, end: activityEnd, group: group) { value in if let value = value { resultQueue.sync { result["latestBloodOxygen"] = value } } }

        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            querySleep(type: sleepType, start: sleepWindowStart, end: sleepWindowEnd) { sleep in
                resultQueue.sync {
                    result["sleepMinutes"] = sleep.totalMinutes
                    result["sleepStageMinutes"] = sleep.stages
                    result["sleepEfficiency"] = sleep.efficiency
                    if let start = sleep.start {
                        result["sleepStart"] = self.isoFormatter.string(from: start)
                        result["sleepStartLocal"] = self.localClockString(start)
                    }
                    if let end = sleep.end {
                        result["sleepEnd"] = self.isoFormatter.string(from: end)
                        result["sleepEndLocal"] = self.localClockString(end)
                    }
                    result["sourceMetadata"] = [
                        "sleepSourceBundle": sleep.sourceBundle ?? "unknown",
                        "sleepSampleCount": sleep.sampleCount
                    ]
                }
                group.leave()
            }
        }

        group.enter()
        queryHourlyActivity(start: dayStart, end: activityEnd) { bins in
            resultQueue.sync {
                result["activityBins"] = bins
                result["activityCoverageHours"] = bins.count
            }
            group.leave()
        }

        group.notify(queue: .global(qos: .userInitiated)) {
            resultQueue.sync { completion(result) }
        }
    }

    private func queryCumulativeField(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        start: Date,
        end: Date,
        group: DispatchGroup,
        completion: @escaping (Double) -> Void
    ) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return }
        group.enter()
        queryCumulative(type: type, unit: unit, start: start, end: end) { value in
            completion(value)
            group.leave()
        }
    }

    private func queryLatestField(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        start: Date,
        end: Date,
        group: DispatchGroup,
        completion: @escaping (Double?) -> Void
    ) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return }
        group.enter()
        queryLatest(type: type, unit: unit, start: start, end: end) { value in
            completion(value)
            group.leave()
        }
    }

    private func queryCumulative(type: HKQuantityType, unit: HKUnit, start: Date, end: Date, completion: @escaping (Double) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate, .strictEndDate])
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, _ in
            completion(statistics?.sumQuantity()?.doubleValue(for: unit) ?? 0)
        }
        healthStore.execute(query)
    }

    private func queryLatest(type: HKQuantityType, unit: HKUnit, start: Date, end: Date, completion: @escaping (Double?) -> Void) {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate, .strictEndDate])
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            guard let sample = samples?.first as? HKQuantitySample else {
                completion(nil)
                return
            }
            completion(sample.quantity.doubleValue(for: unit))
        }
        healthStore.execute(query)
    }

    private struct SleepSummary {
        let totalMinutes: Double
        let stages: [String: Double]
        let start: Date?
        let end: Date?
        let efficiency: Double?
        let sourceBundle: String?
        let sampleCount: Int
    }

    private func querySleep(type: HKCategoryType, start: Date, end: Date, completion: @escaping (SleepSummary) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            let categorySamples = (samples ?? []).compactMap { $0 as? HKCategorySample }
            let grouped = Dictionary(grouping: categorySamples) { $0.sourceRevision.source.bundleIdentifier }
            let candidates = grouped.map { bundle, sourceSamples -> SleepSummary in
                let asleep = sourceSamples.filter { self.sleepStageName($0) != nil && self.sleepStageName($0) != "awake" }
                let awake = sourceSamples.filter { self.sleepStageName($0) == "awake" }
                let total = self.mergedMinutes(asleep)
                var stages: [String: Double] = [:]
                for stage in ["deep", "rem", "core", "asleep", "awake"] {
                    stages[stage] = self.mergedMinutes(sourceSamples.filter { self.sleepStageName($0) == stage })
                }
                let sleepStart = asleep.map(\.startDate).min()
                let sleepEnd = asleep.map(\.endDate).max()
                let elapsed = sleepStart.flatMap { first in sleepEnd.map { $0.timeIntervalSince(first) / 60 } }
                let efficiency = elapsed.flatMap { $0 > 0 ? min(1, total / $0) : nil }
                return SleepSummary(
                    totalMinutes: total,
                    stages: stages,
                    start: sleepStart,
                    end: sleepEnd,
                    efficiency: efficiency,
                    sourceBundle: bundle,
                    sampleCount: sourceSamples.count
                )
            }
            let best = candidates.max {
                let leftDetailed = ($0.stages["deep"] ?? 0) + ($0.stages["rem"] ?? 0) + ($0.stages["core"] ?? 0)
                let rightDetailed = ($1.stages["deep"] ?? 0) + ($1.stages["rem"] ?? 0) + ($1.stages["core"] ?? 0)
                return ($0.totalMinutes + leftDetailed * 0.1) < ($1.totalMinutes + rightDetailed * 0.1)
            }
            completion(best ?? SleepSummary(totalMinutes: 0, stages: [:], start: nil, end: nil, efficiency: nil, sourceBundle: nil, sampleCount: 0))
        }
        healthStore.execute(query)
    }

    private func sleepStageName(_ sample: HKCategorySample) -> String? {
        if sample.value == HKCategoryValueSleepAnalysis.awake.rawValue { return "awake" }
        if sample.value == HKCategoryValueSleepAnalysis.inBed.rawValue { return nil }
        if #available(iOS 16.0, *) {
            if sample.value == HKCategoryValueSleepAnalysis.asleepREM.rawValue { return "rem" }
            if sample.value == HKCategoryValueSleepAnalysis.asleepCore.rawValue { return "core" }
            if sample.value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue { return "deep" }
            if sample.value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue { return "asleep" }
        }
        return "asleep"
    }

    private func mergedMinutes(_ samples: [HKCategorySample]) -> Double {
        let intervals = samples.map { ($0.startDate, $0.endDate) }.sorted { $0.0 < $1.0 }
        guard var current = intervals.first else { return 0 }
        var total: TimeInterval = 0
        for interval in intervals.dropFirst() {
            if interval.0 <= current.1 {
                current.1 = max(current.1, interval.1)
            } else {
                total += current.1.timeIntervalSince(current.0)
                current = interval
            }
        }
        total += current.1.timeIntervalSince(current.0)
        return total / 60
    }

    private func queryHourlyActivity(start: Date, end: Date, completion: @escaping ([[String: Any]]) -> Void) {
        let group = DispatchGroup()
        let writeQueue = DispatchQueue(label: "app.nava.health.hourly")
        var steps: [Date: Double] = [:]
        var energy: [Date: Double] = [:]
        var exercise: [Date: Double] = [:]

        queryHourlyField(.stepCount, unit: .count(), start: start, end: end, group: group) { values in writeQueue.sync { steps = values } }
        queryHourlyField(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: end, group: group) { values in writeQueue.sync { energy = values } }
        queryHourlyField(.appleExerciseTime, unit: .minute(), start: start, end: end, group: group) { values in writeQueue.sync { exercise = values } }

        group.notify(queue: .global(qos: .userInitiated)) {
            let calendar = Calendar.current
            let elapsedHours = min(24, max(1, Int(ceil(end.timeIntervalSince(start) / 3600))))
            let bins = (0..<elapsedHours).map { hour -> [String: Any] in
                let binStart = calendar.date(byAdding: .hour, value: hour, to: start) ?? start
                let binEnd = min(end, calendar.date(byAdding: .hour, value: 1, to: binStart) ?? end)
                return [
                    "hour": hour,
                    "start": self.isoFormatter.string(from: binStart),
                    "end": self.isoFormatter.string(from: binEnd),
                    "steps": steps[binStart] ?? 0,
                    "activeEnergyKcal": energy[binStart] ?? 0,
                    "exerciseMinutes": exercise[binStart] ?? 0
                ]
            }
            completion(bins)
        }
    }

    private func queryHourlyField(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        start: Date,
        end: Date,
        group: DispatchGroup,
        completion: @escaping ([Date: Double]) -> Void
    ) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return }
        group.enter()
        queryHourlyCumulative(type: type, unit: unit, start: start, end: end) { values in
            completion(values)
            group.leave()
        }
    }

    private func queryHourlyCumulative(type: HKQuantityType, unit: HKUnit, start: Date, end: Date, completion: @escaping ([Date: Double]) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate, .strictEndDate])
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

    private func localDateString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func localClockString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}
