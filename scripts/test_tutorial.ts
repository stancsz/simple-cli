import { execSync } from "child_process";

console.log("Running Tutorial Validation via Integration Test...");

try {
  // We use the existing integration test which validates the full onboarding SOP flow
  // This is preferred over a live CLI run in CI environments to avoid timeouts and API costs.
  execSync("npx vitest run tests/integration/onboarding_sop.test.ts", { stdio: "inherit" });
  console.log("✅ Tutorial steps validated successfully (via integration test).");
} catch (e: any) {
  console.error("❌ Validation Failed:", e.message);
  process.exit(1);
}
