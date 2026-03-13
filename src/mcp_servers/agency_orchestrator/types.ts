export interface Task {
  task_id: string;
  description: string;
  dependencies: string[]; // List of task_ids this task depends on
  required_capabilities?: string[];
}

export interface ProjectSpec {
  name: string;
  tasks: Task[];
}

export interface AgencyConfig {
  agency_id?: string; // If null, spawn a new one
  role: string;
  initial_context: string;
  resource_limit: number;
}

export interface Assignment {
  task_id: string;
  agency_id: string;
  assignment_id: string;
  status: "pending" | "in_progress" | "blocked" | "completed" | "failed";
}

export interface Dependency {
  task_id: string;
  depends_on_task_id: string;
  resolution_status: "unresolved" | "resolved";
}

export interface Project {
  project_id: string;
  name: string;
  tasks: Task[];
  assignments: Assignment[];
  dependencies: Dependency[];
  status: "planning" | "in_progress" | "completed" | "failed";
  created_at: number;
  updated_at: number;
}

export interface ProjectStatus {
  project_id: string;
  status: string;
  overall_progress: number; // 0 to 1
  tasks: {
    task_id: string;
    agency_id: string | null;
    status: string;
    is_blocked: boolean;
  }[];
  blockers: string[];
}
