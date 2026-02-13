import { Server } from "./server.js";

export class RemoteWorker {
  constructor(private server: Server) {}

  async run(prompt: string) {
    return this.server.handle(prompt);
  }
}
