import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm/index.js";
import { scanStrategicHorizon } from "./scan_strategic_horizon.js";
import { BoardMeetingMinutes } from "../../../brain/schemas.js";
import { BOARD_PERSONAS, BOARD_MODERATOR_PROMPT } from "../board_prompts.js";
import { randomUUID } from "crypto";

/**
 * Convene an Autonomous Board Meeting.
 * This tool orchestrates a discussion between virtual C-Suite personas (CEO, CFO, CSO)
 * to review the Strategic Horizon and make binding policy decisions.
 */
export const conveneBoardMeeting = async (
  episodic: EpisodicMemory,
  company?: string
): Promise<BoardMeetingMinutes> => {
  const llm = createLLM();

  // 1. Gather Intelligence (Agenda)
  // We use the Strategic Horizon Scan as the primary input document for the board.
  let horizonReport;
  try {
    horizonReport = await scanStrategicHorizon(episodic, company);
  } catch (e) {
    console.error("Board Meeting: Failed to generate Horizon Report", e);
    horizonReport = { error: "Horizon Report unavailable. Proceeding with limited data." };
  }

  // 2. Prepare the Board Packet (Context for LLM)
  // In a real system, we'd also fetch Fleet Status and Financials here explicitly.
  // For now, we assume `scanStrategicHorizon` includes synthesized internal patterns.

  const boardPacket = JSON.stringify(horizonReport, null, 2);

  // 3. Simulate the Meeting
  // We construct a prompt that includes the Personas and the Goal.
  const prompt = `
${BOARD_MODERATOR_PROMPT}

BOARD PACKET (Intelligence Report):
${boardPacket}

PERSONAS:
CEO: ${BOARD_PERSONAS.CEO}
CFO: ${BOARD_PERSONAS.CFO}
CSO: ${BOARD_PERSONAS.CSO}

INSTRUCTIONS:
Conduct the meeting. Have the personas discuss the opportunities and threats in the Board Packet.
Then, generate the "Minutes of the Meeting" as a JSON object.

The JSON MUST strictly follow this structure:
{
  "meeting_id": "uuid",
  "date": "ISO date",
  "attendees": ["CEO", "CFO", "CSO"],
  "agenda_items": ["Review Strategic Horizon", "Policy Adjustments"],
  "discussion_summary": "A brief summary of the debate...",
  "resolutions": [
    {
      "id": "uuid",
      "timestamp": 123456789,
      "decision": "APPROVE / REJECT / AMEND",
      "strategic_direction": "The agreed upon direction...",
      "policy_updates": {
        "min_margin": 0.2,
        "risk_tolerance": "medium",
        "max_agents_per_swarm": 10
      },
      "rationale": "Why this decision was made...",
      "vote_count": { "for": 3, "against": 0, "abstain": 0 }
    }
  ]
}
  `;

  // 4. Generate Minutes
  const response = await llm.generate(prompt, []);

  // 5. Parse and Validate
  try {
    let jsonStr = response.message || response.thought || "";
    jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();

    // Extract JSON if wrapped in text
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    const minutes: BoardMeetingMinutes = JSON.parse(jsonStr);

    // Ensure ID and Metadata
    minutes.meeting_id = minutes.meeting_id || randomUUID();
    minutes.date = minutes.date || new Date().toISOString();
    minutes.attendees = ["CEO", "CFO", "CSO"]; // Enforce attendance

    // 6. Archive Minutes in Corporate Memory
    await episodic.store(
        `board_meeting_${minutes.date}`,
        "Autonomous Board Meeting Minutes",
        JSON.stringify(minutes),
        ["corporate_governance", "board_meeting"],
        company,
        undefined, undefined, undefined, undefined, undefined, undefined,
        "board_meeting"
    );

    return minutes;

  } catch (e: any) {
    throw new Error(`Failed to conduct Board Meeting: ${e.message}\nRaw LLM Output: ${response.message}`);
  }
};
