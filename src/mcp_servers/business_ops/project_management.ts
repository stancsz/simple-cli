import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const LINEAR_API_URL = "https://api.linear.app/graphql";

export async function fetchLinear(query: string, variables: Record<string, any> = {}) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY environment variable is not set.");
  }

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API request failed: ${response.statusText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`Linear API errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  return result.data;
}

export async function getOpenIssueCount(): Promise<number> {
  const query = `
    query Issues($filter: IssueFilter) {
      issues(filter: $filter) {
        nodes {
          id
        }
      }
    }
  `;
  // Count issues that are not Done or Canceled.
  // Using a simplified filter for now: state name != "Done" and != "Canceled"
  // Linear API supports 'state: { type: { in: ["started", "unstarted"] } }' which is better.
  const filter = { state: { type: { in: ["started", "unstarted"] } } };

  try {
    const data = await fetchLinear(query, { filter });
    return data.issues.nodes.length;
  } catch (e) {
    console.error("Error fetching open issue count:", e);
    return 0;
  }
}

export function registerProjectManagementTools(server: McpServer) {
  // Tool: List Issues
  server.tool(
    "linear_list_issues",
    "List issues from Linear with optional filtering.",
    {
      first: z.number().optional().default(50).describe("Number of issues to return (default: 50)."),
      teamId: z.string().optional().describe("Filter by Team ID."),
      state: z.string().optional().describe("Filter by state name (e.g., 'In Progress').")
    },
    async ({ first, teamId, state }) => {
      try {
        const query = `
          query Issues($first: Int, $filter: IssueFilter) {
            issues(first: $first, filter: $filter) {
              nodes {
                id
                identifier
                title
                description
                priority
                state {
                  name
                }
                team {
                  id
                  name
                }
                assignee {
                  name
                }
                createdAt
                updatedAt
              }
            }
          }
        `;

        const filter: any = {};
        if (teamId) filter.team = { id: { eq: teamId } };
        if (state) filter.state = { name: { eq: state } };

        const data = await fetchLinear(query, { first, filter });
        return {
          content: [{
            type: "text",
            text: JSON.stringify(data.issues.nodes, null, 2)
          }]
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text",
            text: `Error listing issues: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Create Issue
  server.tool(
    "linear_create_issue",
    "Create a new issue in Linear.",
    {
      title: z.string().describe("Issue title."),
      teamId: z.string().describe("Team ID to create the issue in."),
      description: z.string().optional().describe("Issue description (markdown supported)."),
      priority: z.number().optional().describe("Priority (0=No Priority, 1=Urgent, 2=High, 3=Normal, 4=Low)."),
      stateId: z.string().optional().describe("State ID (optional).")
    },
    async ({ title, teamId, description, priority, stateId }) => {
      try {
        const mutation = `
          mutation IssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
                title
                url
              }
            }
          }
        `;

        const input: any = { title, teamId };
        if (description) input.description = description;
        if (priority !== undefined) input.priority = priority;
        if (stateId) input.stateId = stateId;

        const data = await fetchLinear(mutation, { input });

        if (!data.issueCreate.success) {
             throw new Error("Failed to create issue (unknown error).");
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(data.issueCreate.issue, null, 2)
          }]
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text",
            text: `Error creating issue: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Update Issue
  server.tool(
    "linear_update_issue",
    "Update an existing issue in Linear.",
    {
      id: z.string().describe("The Issue ID (e.g., UUID or key)."),
      title: z.string().optional().describe("New title."),
      description: z.string().optional().describe("New description."),
      stateId: z.string().optional().describe("New State ID."),
      priority: z.number().optional().describe("New priority."),
      assigneeId: z.string().optional().describe("New Assignee User ID.")
    },
    async ({ id, title, description, stateId, priority, assigneeId }) => {
      try {
        const mutation = `
          mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) {
              success
              issue {
                id
                title
                state {
                  name
                }
                updatedAt
              }
            }
          }
        `;

        const input: any = {};
        if (title) input.title = title;
        if (description) input.description = description;
        if (stateId) input.stateId = stateId;
        if (priority !== undefined) input.priority = priority;
        if (assigneeId) input.assigneeId = assigneeId;

        const data = await fetchLinear(mutation, { id, input });

         if (!data.issueUpdate.success) {
             throw new Error("Failed to update issue (unknown error).");
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(data.issueUpdate.issue, null, 2)
          }]
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text",
            text: `Error updating issue: ${e.message}`
          }],
          isError: true
        };
      }
    }
  );
}
