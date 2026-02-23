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

## Integration Architecture

The Persona Engine is integrated directly into the core `LLM` class and individual interface adapters (`src/interfaces/`) to ensure consistent personality application across all channels.

### 1. Voice Consistency (LLM Injection)
The `LLM` class (`src/llm.ts`) handles the core personality injection:
-   **System Prompt Injection**: `injectPersonality(systemPrompt)` prepends the persona's role, tone, and constraints to the system prompt before every generation.
-   **Response Transformation**: `transformResponse(response)` processes the LLM output to inject catchphrases, emojis, and simulate typing latency.

### 2. Interface Behavior (Slack, Teams, Discord)
Each interface adapter implements specific logic to respect the persona's constraints:

1.  **Working Hours Enforcement**: Before processing any event, the adapter checks `persona.isWithinWorkingHours()`. If outside configured hours (e.g., 09:00-17:00), it immediately replies with an "Offline" message and halts execution.
2.  **Reaction Logic**: Upon receiving a message, the adapter uses `persona.getReaction(text)` to determine an appropriate emoji (e.g., 👍 for short tasks, 🏗️ for long tasks) and reacts to the user message.
3.  **Typing Simulation**:
    -   **Initial Indicator**: The adapter sends a "Typing..." or "Thinking..." signal immediately.
    -   **Response Latency**: The `LLM` class calculates a typing delay proportional to the response length (`calculateTypingDelay`) and waits before returning the final text, simulating human typing speed.

### Supported Interfaces
-   **Slack**: (`src/interfaces/slack.ts`) Uses `client.reactions.add` and thread replies.
-   **Teams**: (`src/interfaces/teams.ts`) Uses `sendActivity` with `ActivityTypes.Typing` and `MessageReaction`.
-   **Discord**: (`src/interfaces/discord.ts`) Uses `message.react` and `channel.sendTyping`.
