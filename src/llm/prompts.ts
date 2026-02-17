export const SYSTEM_PROMPT_TEMPLATE = (
  basePrompt: string,
  repoMap: string,
  activeFiles: string[],
  toolDefs: string,
  relevantMemory: string
) => `
${basePrompt}

## Relevant Past Experience
${relevantMemory || "No relevant past experience found."}

## Tools
${toolDefs}

## Repository
${repoMap}

## Active Files
${activeFiles.join(", ") || "None"}
`;
