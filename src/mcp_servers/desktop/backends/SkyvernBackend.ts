import { DesktopBackend } from "../interfaces/DesktopBackend.js";

export class SkyvernBackend implements DesktopBackend {
  async init() {
    console.log("Initializing Skyvern Backend (Stub)...");
    if (!process.env.SKYVERN_API_KEY) {
        throw new Error("SKYVERN_API_KEY is required for Skyvern Backend");
    }
  }

  async navigate_to(url: string): Promise<string> {
    throw new Error("Skyvern Backend: navigate_to not implemented yet.");
  }

  async click_element(selector: string): Promise<string> {
    throw new Error("Skyvern Backend: click_element not implemented yet.");
  }

  async type_text(selector: string, text: string): Promise<string> {
    throw new Error("Skyvern Backend: type_text not implemented yet.");
  }

  async take_screenshot(): Promise<string> {
    throw new Error("Skyvern Backend: take_screenshot not implemented yet.");
  }

  async extract_page_text(): Promise<string> {
    throw new Error("Skyvern Backend: extract_page_text not implemented yet.");
  }

  async shutdown() {
  }
}
