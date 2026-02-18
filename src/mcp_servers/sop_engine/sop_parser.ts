export interface SOPStep {
  number: number;
  name: string;
  description: string;
}

export interface SOP {
  title: string;
  description: string;
  steps: SOPStep[];
}

export function parseSOP(content: string): SOP {
  const lines = content.split('\n');
  let title = '';
  let descriptionLines: string[] = [];
  const steps: SOPStep[] = [];

  let currentStep: SOPStep | null = null;
  let inSteps = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmedLine = rawLine.trim();

    // Extract Title (first H1)
    if (!title && trimmedLine.startsWith('# ')) {
      title = trimmedLine.substring(2).trim();
      continue;
    }

    // Identify numbered steps (e.g., "1. **Name**" or "1. Name")
    const stepMatch = trimmedLine.match(/^(\d+)\.\s+(.*)$/);

    if (stepMatch) {
      // Save previous step
      if (currentStep) {
        currentStep.description = currentStep.description.trim();
        steps.push(currentStep);
      }

      const num = parseInt(stepMatch[1], 10);
      const rawContent = stepMatch[2].trim();
      let name = '';
      let initialDesc = '';

      // Check for **Name** convention
      const boldMatch = rawContent.match(/^\*\*(.*?)\*\*(.*)$/);
      if (boldMatch) {
          name = boldMatch[1].trim();
          initialDesc = boldMatch[2].trim();
          // Remove common separators like ": " or " - "
          initialDesc = initialDesc.replace(/^[:\-]\s+/, '');
      } else {
          // Fallback: The whole line is the name
          name = rawContent;
      }

      currentStep = {
        number: num,
        name: name,
        description: initialDesc
      };
      inSteps = true;
      continue;
    }

    // Accumulate description
    if (inSteps && currentStep) {
      // If line is empty, preserve it as newline (but be careful not to add too many)
      if (currentStep.description !== '') {
         currentStep.description += '\n' + rawLine;
      } else {
         currentStep.description = rawLine;
      }
    } else if (!inSteps) {
      if (title && trimmedLine) { // Only start description after title
          descriptionLines.push(rawLine);
      } else if (title && !trimmedLine && descriptionLines.length > 0) {
          descriptionLines.push(''); // Preserve paragraph breaks in main description
      }
    }
  }

  // Push the last step
  if (currentStep) {
    currentStep.description = currentStep.description.trim();
    steps.push(currentStep);
  }

  return {
    title,
    description: descriptionLines.join('\n').trim(),
    steps
  };
}
