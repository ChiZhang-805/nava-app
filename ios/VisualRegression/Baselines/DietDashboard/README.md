# Diet dashboard baselines

This directory accepts only reviewer-approved PNG screenshots produced by
`NavaDietDashboardVisualTests` on the pinned macOS 15 / Xcode 26 workflow.

The workflow never promotes its own first run to a passing baseline. When a PNG
is missing, it uploads the simulator screenshot as `candidate-baseline.png` and
fails that matrix case. After visual review, copy the approved candidate here
using the scenario name printed by the workflow, for example:

`iphone-16-pro_zh-default_populated.png`

Every later run exports the actual screenshot, an amplified absolute diff, a
50/50 overlay, and numeric error metrics. A baseline must not be taken from the
retired HTML prototype or either rejected NAVA screenshot.
