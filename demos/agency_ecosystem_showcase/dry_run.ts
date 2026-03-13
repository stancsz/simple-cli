// Dry run simply executes the orchestration script as it is already heavily mocked/simulated
import { execSync } from "child_process";
import path from "path";

console.log("Initiating Dry Run for Agency Ecosystem Showcase...");
const scriptPath = path.join(process.cwd(), "demos/agency_ecosystem_showcase/orchestration_script.ts");
execSync(`npx tsx ${scriptPath}`, { stdio: 'inherit' });
