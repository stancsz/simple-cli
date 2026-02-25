import { DesktopDriver } from "./types.js";
import { logMetric } from "../../logger.js";

export interface ValidationResult {
  driver: string;
  success: boolean;
  checks: {
    initialization: boolean;
    navigation: boolean;
    extraction: boolean;
    screenshot: boolean;
    shutdown: boolean;
  };
  errors: string[];
  latency: number;
}

export class DriverValidator {
  /**
   * Validates a desktop driver by running a standard test suite.
   * Tests:
   * 1. Initialization
   * 2. Navigation (to example.com)
   * 3. Text Extraction
   * 4. Screenshot
   * 5. Shutdown
   */
  async validate(driver: DesktopDriver, options: { skipShutdown?: boolean } = {}): Promise<ValidationResult> {
    const start = Date.now();
    const result: ValidationResult = {
      driver: driver.name,
      success: false,
      checks: {
        initialization: false,
        navigation: false,
        extraction: false,
        screenshot: false,
        shutdown: false,
      },
      errors: [],
      latency: 0,
    };

    try {
      // 1. Initialization
      try {
        await driver.init();
        result.checks.initialization = true;
      } catch (e) {
        result.errors.push(`Initialization failed: ${(e as Error).message}`);
        throw e; // Stop if init fails
      }

      // 2. Navigation
      try {
        await driver.navigate("https://example.com");
        result.checks.navigation = true;
      } catch (e) {
        result.errors.push(`Navigation failed: ${(e as Error).message}`);
        // Continue to try other things if possible, but navigation is usually critical
      }

      // 3. Extraction
      try {
        const text = await driver.extract_text();
        if (text && text.length > 0) {
          result.checks.extraction = true;
        } else {
          result.errors.push("Extraction returned empty text");
        }
      } catch (e) {
        result.errors.push(`Extraction failed: ${(e as Error).message}`);
      }

      // 4. Screenshot
      try {
        const screenshot = await driver.screenshot();
        if (screenshot && screenshot.length > 0) {
          result.checks.screenshot = true;
        } else {
          result.errors.push("Screenshot returned empty data");
        }
      } catch (e) {
        result.errors.push(`Screenshot failed: ${(e as Error).message}`);
      }

      // 5. Shutdown (conditional)
      if (!options.skipShutdown) {
          try {
            await driver.shutdown();
            result.checks.shutdown = true;
          } catch (e) {
            result.errors.push(`Shutdown failed: ${(e as Error).message}`);
          }
      } else {
          result.checks.shutdown = true; // Assume success if skipped
      }

      // overall success if all checks passed
      result.success = Object.values(result.checks).every((c) => c);

    } catch (e) {
      // Catch-all for fatal errors (like init failure)
      if (!result.errors.includes(`Fatal error: ${(e as Error).message}`)) {
         // Avoid double logging if already pushed
      }
    } finally {
      result.latency = Date.now() - start;
      await logMetric('desktop_orchestrator', 'driver_validation', result.latency, {
        driver: driver.name,
        success: result.success
      });
    }

    return result;
  }
}
