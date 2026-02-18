import { PersonaMiddleware } from "../persona/middleware.js";

export abstract class BaseInterface {
  protected middleware: PersonaMiddleware;

  constructor() {
    this.middleware = new PersonaMiddleware();
  }

  async initialize(): Promise<void> {
    await this.middleware.initialize();
  }

  /**
   * Sends the raw content to the specific interface channel.
   * @param content The message content to send.
   * @param metadata Optional metadata (e.g., channel ID, thread ID).
   */
  abstract sendRaw(content: string, metadata?: any): Promise<void>;

  /**
   * Sends a response through the persona middleware.
   * @param content The message content.
   * @param context The type of message ('log' or 'response').
   * @param metadata Optional metadata for the interface.
   * @param onTyping Optional callback for typing indicators.
   */
  async sendResponse(
    content: string,
    context: 'log' | 'response' = 'response',
    metadata?: any,
    onTyping?: () => void
  ): Promise<void> {
    const transformed = await this.middleware.transform(content, onTyping, context);
    await this.sendRaw(transformed, metadata);
  }
}
