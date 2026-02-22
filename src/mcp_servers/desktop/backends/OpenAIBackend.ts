import { DesktopBackend } from "../interfaces/DesktopBackend.js";

export class OpenAIBackend implements DesktopBackend {
  async init() {
    console.log("Initializing OpenAI Operator Backend (Stub)...");
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required for OpenAI Operator Backend");
    }
  }

  async navigate_to(url: string): Promise<string> {
    throw new Error("OpenAI Operator Backend: navigate_to not implemented yet.");
  }

  async click_element(selector: string): Promise<string> {
    throw new Error("OpenAI Operator Backend: click_element not implemented yet.");
  }

  async type_text(selector: string, text: string): Promise<string> {
    throw new Error("OpenAI Operator Backend: type_text not implemented yet.");
  }

  async take_screenshot(): Promise<string> {
    throw new Error("OpenAI Operator Backend: take_screenshot not implemented yet.");
  }

  async extract_page_text(): Promise<string> {
    throw new Error("OpenAI Operator Backend: extract_page_text not implemented yet.");
  }

  async shutdown() {
  }
}
