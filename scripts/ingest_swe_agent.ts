
import { analyze_cli_tool, generate_mcp_scaffold } from "../src/mcp_servers/framework_analyzer/tools.js";

const sweAgentHelpText = `
usage: swe-agent [-h] [--model_name MODEL_NAME] [--issue_url ISSUE_URL] [--repo_path REPO_PATH] [--config_file CONFIG_FILE]

SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering

optional arguments:
  -h, --help            show this help message and exit
  --model_name MODEL_NAME
                        Name of the model to use (e.g., gpt4, claude-3-opus)
  --issue_url ISSUE_URL
                        URL of the GitHub issue to fix
  --repo_path REPO_PATH
                        Path to the local repository
  --config_file CONFIG_FILE
                        Path to the configuration yaml file
`;

async function main() {
  console.log("Starting SWE-agent ingestion simulation...");

  console.log("Analyzing CLI help text...");
  const analysisResult = await analyze_cli_tool("swe-agent", sweAgentHelpText);

  if (analysisResult.error) {
    console.error("Analysis failed:", analysisResult.error);
    process.exit(1);
  }

  console.log("Analysis Result:", JSON.stringify(analysisResult, null, 2));

  console.log("Generating MCP scaffold...");
  const scaffoldResult = await generate_mcp_scaffold("swe_agent", analysisResult);

  if (scaffoldResult.error) {
    console.error("Scaffold generation failed:", scaffoldResult.error);
    process.exit(1);
  }

  console.log("Scaffold generation success:", scaffoldResult.message);
  console.log("Files created:", scaffoldResult.files);
}

main().catch(console.error);
