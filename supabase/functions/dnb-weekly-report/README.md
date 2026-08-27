# NAVA-FDNB Health weekly report

This authenticated Edge Function is the application-facing entry point for the
NAVA-FDNB Health research adapter. It reads up to 84 days of the authenticated
user's six record groups and wearable snapshots, creates privacy-safe derived
features, runs the longitudinal window scorer, and persists a versioned weekly
snapshot when the corresponding migration is available.

The response keeps `transitionScore` (window transition strength) separate from
`peakScore` (candidate localization) and includes `evidenceLevel`, `accepted`,
data quality, contributors, diagnostics, model version, and an explicit
non-diagnostic disclaimer. Insufficient coverage never receives a synthetic or
fallback DNB score.

The original single-cell `h5ad` FDNB package is not executed here. This adapter
is an independently implemented health-time-series research layer and requires
separate longitudinal validation before any clinical or diagnostic use.
