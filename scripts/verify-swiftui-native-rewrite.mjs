import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const failures = [];
const checks = [];

function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) failures.push(`${name}: ${detail}`);
}

const project = read("ios/App/App.xcodeproj/project.pbxproj");
const plist = read("ios/App/App/Info.plist");
const bridge = read("ios/App/App/NavaBridgeViewController.swift");
const model = read("ios/App/App/NativeUI/NavaNativeAppModel.swift");
const scanModels = read("ios/App/App/NativeUI/FoodScan/NavaFoodScanModels.swift");
const scanView = read("ios/App/App/NativeUI/FoodScan/NavaFoodScanView.swift");
const dietDashboard = read("ios/App/App/NativeUI/FoodScan/NavaDietDashboardView.swift");
const dietVisualTests = read("ios/App/AppUITests/NavaDietDashboardVisualTests.swift");
const dietVisualWorkflow = read(".github/workflows/ios-diet-dashboard-visual.yml");
const dietVisualDiff = read("scripts/ios-visual-diff.swift");
const visualization = read("ios/App/App/NativeUI/FoodScan/NavaFoodVisualizationService.swift");
const visualizer = read("ios/App/App/NativeUI/FoodScan/NavaSupabaseDishVisualizer.swift");
const recognizer = read("ios/App/App/NativeUI/FoodScan/NavaSupabaseDietRecognizer.swift");
const visualFunction = read("supabase/functions/food-visualize/index.ts");
const visualPrompt = read("supabase/functions/_shared/food-visual-prompt.ts");
const dietFunction = read("supabase/functions/diet-extract/index.ts");
const deletionFunction = read("supabase/functions/delete-account/index.ts");
const renderMigration = read("supabase/migrations/202611070001_diet_render_assets.sql");
const credentialBoundFunctions = [
  "ai-chat-reply",
  "ai-diet-report",
  "ai-extract-data",
  "ai-health-report",
  "diet-extract",
  "face-analyze",
  "food-visualize",
  "journal-assistant",
].map((name) => read(`supabase/functions/${name}/index.ts`)).join("\n");

const swiftFiles = [
  "NavaNativeDesignSystem.swift",
  "NavaNativeAppModel.swift",
  "NavaNativeRootView.swift",
  "NavaNativeAuthViews.swift",
  "NavaFoodScanModels.swift",
  "NavaFoodVisualizationService.swift",
  "NavaFoodCameraService.swift",
  "NavaFoodScanView.swift",
  "NavaSupabaseDietRecognizer.swift",
  "NavaSupabaseDishVisualizer.swift",
  "NavaDietDashboardView.swift",
];

for (const file of swiftFiles) {
  const label = new RegExp(`${file.replaceAll(".", "\\.")} in Sources`, "g");
  check(
    `Xcode source membership: ${file}`,
    (project.match(label) ?? []).length === 2,
    "expected one PBXBuildFile label and one Sources-phase entry",
  );
}

check(
  "Native UI remains opt-in",
  /<key>NavaNativeUIEnabled<\/key>\s*<false\/>/.test(plist),
  "the incomplete rewrite must not replace the current TestFlight UI by default",
);
check(
  "Bridge has an explicit feature gate",
  bridge.includes("NavaNativeFeatureFlag.isEnabled") && bridge.includes("NAVA_NATIVE_UI"),
  "native overlay must be enabled deliberately",
);
check(
  "Independent tab navigation stacks",
  ["todayPath", "recordsPath", "profilePath"].every((name) => model.includes(name)) &&
    !model.includes("var path = NavigationPath"),
  "tabs must not share one NavigationPath",
);
check(
  "Generated dish state machine",
  ["understandingDish", "confirmDish", "planningVisual", "generatingAsset", "validatingAsset", "review"]
    .every((phase) => scanModels.includes(phase)) &&
    scanView.includes("confirmDishIdentity") && scanView.includes("generateDisplayAsset"),
  "recognition, user correction, generation, validation, and review must be separate truthful stages",
);
check(
  "Strict generated-asset quality gate",
  scanModels.includes("pixelWidth == 1024") &&
    scanModels.includes("pixelHeight == 1024") &&
    scanModels.includes("dishIdentityScore >= 0.90") &&
    scanModels.includes("visibleIngredientRecall >= 0.85") &&
    scanModels.includes("unexpectedIngredientScore <= 0.05") &&
    scanModels.includes("artifactScore <= 0.06") &&
    scanView.includes("asset.isApprovedForDisplay"),
  "only an exact transparent asset that passes identity, ingredient, composition, and artifact gates may display",
);
check(
  "Legacy foreground segmentation removed",
  !project.includes("NavaFoodSegmentationService.swift") &&
    !scanModels.includes("NavaFoodSegmenting") && !scanView.includes("cutoutImage"),
  "the product workflow is generative reconstruction, not foreground cutout or plate compositing",
);
check(
  "Unavailable AI services fail honestly",
  visualization.includes("recognitionServiceUnavailable") &&
    visualization.includes("visualizationServiceUnavailable") &&
    scanView.includes("NavaPendingFoodRecognizer") && scanView.includes("NavaPendingDishVisualizer"),
  "the app must not manufacture a successful recognition or generated asset before authenticated services are connected",
);
check(
  "Private authenticated recognition adapter",
  recognizer.includes("diet-photos") &&
    recognizer.includes("functions/v1/diet-extract") &&
    recognizer.includes("Bearer \\(session.accessToken)") &&
    recognizer.includes("try? await delete"),
  "photo upload, JWT invocation, and failed-request cleanup are required",
);
check(
  "Private authenticated visualization adapter",
  visualizer.includes("functions/v1/food-visualize") &&
    visualizer.includes("Bearer \\(session.accessToken)") &&
    visualizer.includes("NavaDishTechnicalValidator.inspect") && visualizer.includes("transparentPixelRatio"),
  "generated assets require a JWT Edge Function call and independent native PNG/alpha/layout verification",
);
check(
  "Domestic server generation and semantic critic gate",
  visualFunction.includes("DASHSCOPE_API_KEY_NAVA") &&
    visualFunction.includes("wan2.7-image") && visualFunction.includes("wan2.7-image-pro") &&
    visualFunction.includes("qwen3-vl-plus") && visualFunction.includes("NAVA_FOOD_MATTING_URL") &&
    visualFunction.includes("for (let attempt = 1; attempt <= 2") &&
    visualFunction.includes("callQualityCritic") && visualFunction.includes("diet-renders") &&
    visualFunction.includes("remove([assetPath])") &&
    !visualFunction.includes("api.openai.com") &&
    !visualFunction.includes('Deno.env.get("DASHSCOPE_API_KEY")'),
  "generation must use domestic NAVA-scoped models, normalize transparency, retry at most twice, remove rejects, and block unreviewed assets",
);
check(
  "Evidence-bound visual prompt",
  visualPrompt.includes("plain matte white") && visualPrompt.includes("transparent") &&
    visualPrompt.includes("Do not add ingredients") && visualPrompt.includes("1024"),
  "the renderer must preserve visible food evidence and output the fixed transparent plate specification",
);
check(
  "NAVA-only food recognition key",
  dietFunction.includes("DASHSCOPE_API_KEY_NAVA") &&
    !dietFunction.includes('Deno.env.get("DASHSCOPE_API_KEY")'),
  "food recognition must not fall back to a generic or another project's credential",
);
check(
  "NAVA AI credential isolation",
  credentialBoundFunctions.includes("DEEPSEEK_API_KEY_NAVA") &&
    credentialBoundFunctions.includes("DASHSCOPE_API_KEY_NAVA") &&
    !credentialBoundFunctions.includes('Deno.env.get("DEEPSEEK_API_KEY")') &&
    !credentialBoundFunctions.includes("Deno.env.get('DEEPSEEK_API_KEY')") &&
    !credentialBoundFunctions.includes('Deno.env.get("DASHSCOPE_API_KEY")') &&
    !credentialBoundFunctions.includes("Deno.env.get('DASHSCOPE_API_KEY')") &&
    !credentialBoundFunctions.includes('Deno.env.get("OPENAI_API_KEY")') &&
    !credentialBoundFunctions.includes("Deno.env.get('OPENAI_API_KEY')"),
  "all AI entry points involved in the native workflow must use NAVA-scoped credentials only",
);
check(
  "Private render storage lifecycle",
  renderMigration.includes("values ('diet-renders', 'diet-renders', false") &&
    deletionFunction.includes('"diet-renders"'),
  "render assets must live in a private bucket and be included in account deletion",
);
check(
  "No iOS 17-only UI surface in the 16.4 shell",
  !scanView.includes("ContentUnavailableView") &&
    !read("ios/App/App/NativeUI/NavaNativeRootView.swift").includes("@Observable"),
  "the deployment target remains iOS 16.4",
);

check(
  "Diet dashboard matches the nine-segment reference structure",
  dietDashboard.includes("private struct NavaDietGaugeLayout: Layout") &&
    dietDashboard.includes("private struct NavaDietGaugeSegmentShape: Shape") &&
    dietDashboard.includes("static let segmentCount = 9") &&
    dietDashboard.includes("startAngleDegrees") &&
    dietDashboard.includes('isChinese ? "午餐" : "Lunch"') &&
    dietDashboard.includes('isChinese ? "早餐" : "Breakfast"') &&
    ["Protein", "Carbs", "Fat"].every((label) => dietDashboard.includes(`label: "${label}"`)) &&
    dietDashboard.includes("dishImageSlot(size:") &&
    dietDashboard.includes("private struct NavaDietEditIcon: View") &&
    dietDashboard.includes('systemName: "pencil"') &&
    dietDashboard.includes("Capsule()") &&
    dietDashboard.includes("width: min(max(width * 0.16, 50), 56)") &&
    !dietDashboard.includes("RoundedRectangle(cornerRadius: 11"),
  "the native overview must use a measured custom Layout/Shape gauge and retain the reference meal-card hierarchy",
);

check(
  "Diet dashboard is connected to native scanning and editing",
  dietDashboard.includes("NavigationLink(value: NavaRoute.foodScan)") &&
    dietDashboard.includes("NavaDietNutritionEditor") &&
    dietDashboard.includes("tabViewStyle(.page"),
  "photo capture, horizontal dish switching, and nutrition correction must remain reachable",
);

check(
  "Diet dashboard visual test target",
  (project.match(/NavaDietDashboardVisualTests\.swift in Sources/g) ?? []).length === 2 &&
    project.includes('productType = "com.apple.product-type.bundle.ui-testing"') &&
    dietVisualTests.includes("XCUIScreen.main.screenshot()") &&
    dietVisualTests.includes('["diet.dashboard"]') &&
    dietVisualTests.includes("imageAttachment.lifetime = .keepAlways"),
  "the UI-test bundle must launch the dashboard and preserve a named full-screen screenshot attachment",
);

check(
  "Diet visual regression produces review evidence",
  dietVisualWorkflow.includes("runs-on: macos-15") &&
    dietVisualWorkflow.includes("Xcode_26") &&
    dietVisualWorkflow.includes("candidate-baseline.png") &&
    dietVisualWorkflow.includes("actual.png") &&
    dietVisualDiff.includes('path: "\\(outputDirectory)/diff.png"') &&
    dietVisualDiff.includes('path: "\\(outputDirectory)/overlay.png"'),
  "the independent workflow must keep actual/candidate evidence and compare approved baselines into diff and overlay artifacts",
);

for (const asset of [
  "NavaHomeScene",
  "NavaMascot",
  "NavaAuthTexture",
  "NavaFoodTomatoEggs",
  "NavaFoodSeafoodPaella",
  "NavaFoodChickenRice",
]) {
  check(
    `Native asset exists: ${asset}`,
    exists(`ios/App/App/Assets.xcassets/${asset}.imageset/Contents.json`),
    "missing asset catalog entry",
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  status: failures.length ? "failed" : "passed",
  checks,
  failures,
};
const outputDir = path.resolve(root, "../../Build/TestRuns/App-Checks/swiftui-native-rewrite");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "static-verification.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`SwiftUI native rewrite static verification passed (${checks.length} checks).`);
console.log(path.join(outputDir, "static-verification.json"));
