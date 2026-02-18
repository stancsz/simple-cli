# Persona Engine

The **Persona Engine** enables Simple CLI to adopt a specific personality, tone, and behavioral pattern when interacting through chat interfaces (Slack, Teams, Discord). It transforms the raw, technical output of the LLM into a more human-like, role-specific response.

## Configuration

The persona is configured via `.agent/config/persona.json`.
*Legacy path `.agent/persona.json` is also supported for backward compatibility.*

### Structure

```json
{
  "name": "Sarah_DevOps",
  "role": "Site Reliability Engineer",
  "voice": {
    "tone": "professional, vigilant, slightly paranoid about uptime, uses technical jargon but explains clearly"
  },
  "emoji_usage": true,
  "catchphrases": {
    "greeting": ["Systems check complete.", "All green on the dashboard.", "Scanning logs..."],
    "signoff": ["Staying vigilant.", "Monitoring the situation.", "Over and out."],
    "filler": ["Checking metrics...", "Hold on, parsing trace..."]
  },
  "working_hours": "09:00-17:00",
  "response_latency": {
    "min": 1000,
    "max": 3000
  },
  "enabled": true
}
```

- **name**: The display name of the persona.
- **role**: The job title or role description.
- **voice.tone**: A description of how the persona should sound. This is used by the LLM to rewrite responses.
- **emoji_usage**: If true, emojis may be added to messages.
- **catchphrases**: Lists of phrases to inject at start (greeting), end (signoff), or middle (filler) of messages.
- **working_hours**: Time range (HH:mm-HH:mm) when the persona is active. Outside these hours, it replies with an "Offline" message.
- **response_latency**: Simulated typing delay in milliseconds.
- **enabled**: Master switch to enable/disable the persona.

## Middleware Architecture

The Persona Engine uses a **Middleware** pattern (`src/persona/middleware.ts`) that wraps all interface outputs.

### Transformation Process

1.  **Working Hours Check**: If the current time is outside `working_hours`, the message is replaced with an "Offline" notice.
2.  **LLM Tone Rewrite**: For final responses (`context: 'response'`), the raw text is sent to a fast LLM to be rewritten according to the `voice.tone` and `role`. This ensures the semantic meaning is preserved while the style changes.
    - *Note:* Log updates (`context: 'log'`) skip this step to preserve speed and clarity.
3.  **Catchphrases & Emojis**: The engine injects greeting, signoff, or filler phrases and emojis based on regex patterns and probability.
4.  **Typing Simulation**: The engine calculates a delay based on `response_latency` and triggers the interface's "Typing..." indicator (if supported) before sending the message.

## Integration

The middleware is integrated into `BaseInterface` (`src/interfaces/base.ts`), which is extended by all specific adapters:
- **Slack**: `src/interfaces/slack.ts`
- **Teams**: `src/interfaces/teams.ts`
- **Discord**: `src/interfaces/discord.ts`

To use the persona in a new interface, extend `BaseInterface` and use `this.sendResponse(content, context)` instead of sending raw messages directly.

## Autonomous Agent Persona

Autonomous agents (like the **Job Delegator** and **Reviewer Agent**) running in the background via `daemon` also utilize the Persona Engine.

-   **Ghost Mode**: When running in `daemon` mode (Ghost Mode), agents automatically load the persona configuration.
-   **No Latency**: Background agents bypass the typing simulation to ensure efficient execution, but still apply tone rewriting and catchphrases to their logs and outputs.
-   **Consistent Voice**: Whether it's a GitHub comment from the Reviewer Agent or a log entry from the Job Delegator, the voice remains consistent with the configured persona.

### Example: Reviewer Agent

If the persona is "Sarah_DevOps" (SRE), the Reviewer Agent's feedback on a PR might look like:

> "Scanning code... 🔍 I've detected a potential race condition in `src/utils.ts`. Systems check: Failed. Please investigate immediately. Over and out."

Instead of the raw:

> "Potential race condition detected in src/utils.ts."
