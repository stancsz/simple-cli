import fs from 'fs';
import path from 'path';

const ROADMAP_PATH = path.join(process.cwd(), 'docs/ROADMAP.md');
const TODO_PATH = path.join(process.cwd(), 'docs/todo.md');

function validateRoadmap() {
  console.log('Validating docs/ROADMAP.md...');
  const content = fs.readFileSync(ROADMAP_PATH, 'utf-8');

  // Check Phase 22 Status
  if (!content.includes('## Phase 22: Autonomous Client Lifecycle')) {
    throw new Error('Phase 22 header not found in ROADMAP.md');
  }
  const phase22Block = content.split('## Phase 22: Autonomous Client Lifecycle')[1].split('## Phase 23')[0];
  if (!phase22Block.includes('*Status: Completed*')) {
    throw new Error('Phase 22 status is not "Completed" in ROADMAP.md');
  }

  // Check Phase 23 Existence and Structure
  if (!content.includes('## Phase 23: Autonomous Agency Governance & Profitability')) {
    throw new Error('Phase 23 header not found in ROADMAP.md');
  }
  const phase23Block = content.split('## Phase 23: Autonomous Agency Governance & Profitability')[1].split('## Legacy Achievements')[0];

  if (!phase23Block.includes('*Status: Proposed*')) {
    throw new Error('Phase 23 status is not "Proposed" in ROADMAP.md');
  }

  const requiredObjectives = [
    'Autonomous KPI Tracking & Reporting',
    'Profitability Optimization',
    'Strategic Decision Engine',
    'Compliance & Risk Management',
    'Validation'
  ];

  requiredObjectives.forEach(obj => {
    if (!phase23Block.includes(obj)) {
      throw new Error(`Phase 23 objective "${obj}" missing in ROADMAP.md`);
    }
  });

  // Check Internal Links
  const linkRegex = /\[.*?\]\((.*?)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const link = match[1];
    if (link.startsWith('http')) continue;

    // Resolve relative path
    const resolvedPath = path.resolve(path.dirname(ROADMAP_PATH), link);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Invalid internal link in ROADMAP.md: ${link} (resolves to ${resolvedPath})`);
    }
  }

  console.log('docs/ROADMAP.md validation passed!');
}

function validateTodo() {
  console.log('Validating docs/todo.md...');
  const content = fs.readFileSync(TODO_PATH, 'utf-8');

  // Check Phase 22 Strikethrough
  if (!content.includes('~~**Lead Generation**:~~')) {
      throw new Error('Phase 22 items not struck through in todo.md');
  }

  // Check Phase 23 Existence
  if (!content.includes('### Phase 23: Autonomous Agency Governance & Profitability')) {
    throw new Error('Phase 23 header not found in todo.md');
  }

  // Check 5 unchecked TODOs
  const phase23Block = content.split('### Phase 23: Autonomous Agency Governance & Profitability')[1];
  const uncheckedTodos = (phase23Block.match(/- \[ \]/g) || []).length;

  if (uncheckedTodos < 5) {
      throw new Error(`Expected at least 5 unchecked TODOs in Phase 23 section of todo.md, found ${uncheckedTodos}`);
  }

  console.log('docs/todo.md validation passed!');
}

try {
  validateRoadmap();
  validateTodo();
  console.log('All validations passed successfully.');
} catch (error) {
  console.error('Validation failed:', error);
  process.exit(1);
}
