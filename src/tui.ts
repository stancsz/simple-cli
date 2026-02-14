import { intro } from "@clack/prompts";
import pc from "picocolors";
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(join(__dirname, "../package.json"), "utf8"),
);

export function showBanner() {
  intro(pc.bgBlue(pc.white(` SIMPLE-CLI v${pkg.version} `)));
}
