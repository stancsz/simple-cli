import pc from "picocolors";
import { BrainStats } from "../brain/usage-tracker.js";

export function renderDashboard(stats: Record<string, BrainStats>) {
  console.clear();
  console.log(pc.bgBlue(pc.white(pc.bold("  BRAIN INTEGRATION DASHBOARD  "))));
  console.log(pc.dim("-----------------------------------"));
  console.log("");

  if (Object.keys(stats).length === 0) {
    console.log(pc.yellow("No brain usage data available yet."));
    return;
  }

  // Header
  const headers = ["Agent/Tool", "Queries", "Hits", "Misses", "Writes"];
  const colWidths = [25, 10, 8, 8, 8];

  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(" | ");
  console.log(pc.bold(headerRow));
  console.log(pc.dim("-".repeat(headerRow.length)));

  // Rows
  for (const [agentId, data] of Object.entries(stats)) {
    const row = [
      agentId.substring(0, 24).padEnd(colWidths[0]),
      String(data.queries).padEnd(colWidths[1]),
      String(data.hits).padEnd(colWidths[2]),
      String(data.misses).padEnd(colWidths[3]),
      String(data.writes).padEnd(colWidths[4]),
    ].join(" | ");

    // Highlight hits > 0 with green, misses > writes with yellow/red?
    // Just color the whole row for now.
    if (data.hits > 0) {
        console.log(pc.green(row));
    } else {
        console.log(row);
    }
  }

  console.log("");
  console.log(pc.dim("Updated: " + new Date().toLocaleTimeString()));
}
