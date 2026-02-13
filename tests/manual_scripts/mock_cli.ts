import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const task = process.argv[2] ?? "";

console.log("Mock CLI received task:", task);

if (task.includes("flask")) {
  try {
    mkdirSync("live-test-flask", { recursive: true });
    writeFileSync(join("live-test-flask", "app.py"), "# Live Test App");
    console.log("Created live-test-flask/app.py");
  } catch (e) {
    console.error("Failed to create file:", e);
  }
}
