import { StagehandServer } from "./stagehand.js";

const server = new StagehandServer();

server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
