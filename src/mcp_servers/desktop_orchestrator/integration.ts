import { DesktopDriver } from "./types.js";
import { logMetric } from "../../logger.js";

export interface VerificationRequest {
  type: 'url_contains' | 'text_present' | 'element_visible';
  value: string; // The URL part, text, or selector to verify
  driver: DesktopDriver;
}

export interface VerificationResult {
  success: boolean;
  message: string;
}

export class DesktopIntegration {
  /**
   * Verifies the state of the desktop/browser after an action.
   * Useful for SOP steps to ensure the action had the intended effect.
   */
  async verify_action(request: VerificationRequest): Promise<VerificationResult> {
    const { type, value, driver } = request;
    const start = Date.now();
    let success = false;
    let message = "";

    try {
      if (type === 'url_contains') {
        // Most drivers don't expose current URL directly in the interface,
        // so we might need to rely on extract_text or add a method.
        // For now, let's assume we can get it via execution or similar.
        // Or better, we can assume the driver state is maintained and we can ask for it.
        // But DesktopDriver interface doesn't have `getUrl`.
        // Let's use `execute_complex_flow` or a specific script to get URL if possible,
        // or just skip if not supported.
        // Actually, let's add `get_url` to the interface later if needed.
        // For now, let's try to infer from page content or use a script execution if the driver supports it.

        // Hack: Try to extract text and see if it contains unique indicators of that URL? No.
        // Let's assume we can use `extract_text` to find unique content.

        // Actually, let's just stick to 'text_present' and 'element_visible' for now as they are safer
        // with the current interface.
        // Wait, I can try to execute JS to get URL.
        try {
           // This is driver specific. Stagehand has `page`.
           // Let's assume we use `execute_complex_flow` to ask "What is the current URL?"
           const url = await driver.execute_complex_flow("Return the current URL");
           if (url.includes(value)) {
             success = true;
             message = `URL contains '${value}'`;
           } else {
             message = `URL '${url}' does not contain '${value}'`;
           }
        } catch (e) {
           message = `Could not verify URL: ${(e as Error).message}`;
        }

      } else if (type === 'text_present') {
        const text = await driver.extract_text();
        if (text.includes(value)) {
          success = true;
          message = `Page contains text '${value}'`;
        } else {
          message = `Page does not contain text '${value}'`;
        }

      } else if (type === 'element_visible') {
        // Try to click it? No, that changes state.
        // Try to type into it? No.
        // Let's use execute_complex_flow to check visibility.
        try {
           const result = await driver.execute_complex_flow(`Check if element '${value}' is visible. Return 'true' or 'false'.`);
           if (result.toLowerCase().includes('true')) {
             success = true;
             message = `Element '${value}' is visible`;
           } else {
             message = `Element '${value}' is not visible`;
           }
        } catch (e) {
           message = `Could not verify element visibility: ${(e as Error).message}`;
        }
      }

    } catch (e) {
      message = `Verification error: ${(e as Error).message}`;
    } finally {
        await logMetric('desktop_orchestrator', 'integration_verification', Date.now() - start, {
            type,
            success
        });
    }

    return { success, message };
  }
}
