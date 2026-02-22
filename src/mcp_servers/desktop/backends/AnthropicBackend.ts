import { DesktopBackend } from "../interfaces/DesktopBackend.js";

export class AnthropicBackend implements DesktopBackend {
  async init() {
    console.log("Initializing Anthropic Computer Use Backend (Stub)...");
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is required for Anthropic Backend");
    }
  }

  async navigate_to(url: string): Promise<string> {
    throw new Error("Anthropic Computer Use Backend: navigate_to not implemented yet.");
  }

  async click_element(selector: string): Promise<string> {
    throw new Error("Anthropic Computer Use Backend: click_element not implemented yet.");
  }

  async type_text(selector: string, text: string): Promise<string> {
    throw new Error("Anthropic Computer Use Backend: type_text not implemented yet.");
  }

  async take_screenshot(): Promise<string> {
    throw new Error("Anthropic Computer Use Backend: take_screenshot not implemented yet.");
  }

  async extract_page_text(): Promise<string> {
    throw new Error("Anthropic Computer Use Backend: extract_page_text not implemented yet.");
  }

  async shutdown() {
  }
}
