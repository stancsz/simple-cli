import { ProjectUpdateInput, ProjectFilter } from "@linear/sdk";

// Force TS to fail so I can see available properties
const x: ProjectUpdateInput = { invalidProp: 1 };
const y: ProjectFilter = { invalidProp: 1 };
