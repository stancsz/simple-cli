import { LLM, LLMConfig, LLMResponse, createLLMInstance } from "../llm.js";
import { AdaptiveRouter } from "./router.js";

// Export base types from llm.ts
export { LLM, type LLMConfig, type LLMResponse, createLLMInstance };

// The default export for createLLM now wraps the instance in AdaptiveRouter
export const createLLM = (model?: string): LLM => {
    const instance = createLLMInstance(model);
    return new AdaptiveRouter(instance['configs']);
};
