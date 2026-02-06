import { existsSync, mkdirSync, cpSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { text, confirm, select, isCancel, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to find repo root
const repoRoot = resolve(__dirname, '../../');

interface RoleConfig {
  source: string; // Directory name in examples/
  description: string;
}

interface TemplateConfig {
  name: string;
  description: string;
  roles: Record<string, RoleConfig>; // targetDir -> RoleConfig
}

export const TEMPLATES: Record<string, TemplateConfig> = {
  'software-company': {
    name: 'Software Development Company',
    description: 'A complete product engineering team including Product, Engineering, QA, and Security.',
    roles: {
      'product': { source: 'product-director', description: 'Product Director' },
      'engineering': { source: 'data-engineer', description: 'Lead Engineer' }, // Using Data Engineer as closest tech proxy
      'qa': { source: 'qa-automation', description: 'QA Automation Engineer' },
      'security': { source: 'cybersecurity-analyst', description: 'Cybersecurity Analyst' }
    }
  },
  'marketing-agency': {
    name: 'Marketing & Sales Agency',
    description: 'A growth-focused team including Marketing, Sales, BizDev, and Support.',
    roles: {
      'marketing': { source: 'marketing-director', description: 'Marketing Director' },
      'sales': { source: 'sales-representative', description: 'Sales Representative' },
      'bizdev': { source: 'business-development-director', description: 'Business Development Director' },
      'support': { source: 'customer-support', description: 'Customer Support Agent' }
    }
  }
};

export async function deployCompany(templateKey: string, targetDir: string): Promise<void> {
  const template = TEMPLATES[templateKey];
  if (!template) {
    console.error(pc.red(`Error: Unknown template "${templateKey}"`));
    return;
  }

  const absTargetDir = resolve(targetDir);
  const s = spinner();

  console.log(pc.cyan(`\n🚀 Deploying ${pc.bold(template.name)} to ${absTargetDir}...\n`));

  if (!existsSync(absTargetDir)) {
    mkdirSync(absTargetDir, { recursive: true });
  }

  // 1. Deploy Roles
  s.start('Deploying agents...');

  for (const [roleDir, config] of Object.entries(template.roles)) {
    const rolePath = join(absTargetDir, roleDir);
    const sourcePath = join(repoRoot, 'examples', config.source);

    if (!existsSync(sourcePath)) {
      console.warn(pc.yellow(`Warning: Source role "${config.source}" not found in examples/. Skipping.`));
      continue;
    }

    if (!existsSync(rolePath)) {
      mkdirSync(rolePath, { recursive: true });
    }

    // Copy SOUL.md
    const sourceSoul = join(sourcePath, 'SOUL.md');
    if (existsSync(sourceSoul)) {
      cpSync(sourceSoul, join(rolePath, 'SOUL.md'));
    }

    // Copy tools/ if exists
    const sourceTools = join(sourcePath, 'tools');
    if (existsSync(sourceTools)) {
      cpSync(sourceTools, join(rolePath, 'tools'), { recursive: true });
    }
  }

  s.stop('Agents deployed.');

  // 2. Generate Swarm Configuration (swarm.json)
  const swarmConfig = {
    session: {
      concurrency: 4,
      timeout: 600000
    },
    tasks: Object.keys(template.roles).map((role, i) => ({
      id: `task-${role}`,
      type: 'implement',
      description: `Task for ${role}: [Describe task here]`,
      scope: { directories: [role] }, // Indicating intent to work in this dir
      priority: 2,
      timeout: 300000
    }))
  };

  writeFileSync(join(absTargetDir, 'swarm.json'), JSON.stringify(swarmConfig, null, 2));
  console.log(pc.green(`✔ Created swarm.json configuration`));

  // 3. Generate README.md
  const readmeContent = `# ${template.name}

Deployed by Simple-CLI.

## 👥 Workforce Structure

${Object.entries(template.roles).map(([dir, config]) => `- **${config.description}**: \`./${dir}\``).join('\n')}

## 🚀 How to Run

### Interactive Mode (Single Agent)
Navigate to an agent's directory and run \`simple\`:

\`\`\`bash
cd marketing
simple
\`\`\`

### Swarm Mode (Multi-Agent)
Run the swarm from this directory (requires Simple-CLI installed globally or in path):

\`\`\`bash
simple --swarm --tasks swarm.json
\`\`\`

## 🔑 Configuration
Edit \`.env\` to set your API keys.
`;

  writeFileSync(join(absTargetDir, 'README.md'), readmeContent);
  console.log(pc.green(`✔ Created README.md`));

  // 4. Interactive Token Setup
  const isYolo = process.argv.includes('--yolo') || process.env.VITEST === 'true' || process.env.CI === 'true' || !process.stdin.isTTY;

  if (isYolo) {
    console.log(pc.dim('Skipping token setup in non-interactive/yolo mode.'));
    console.log(pc.green(pc.bold(`\n✅ Deployment Complete!`)));
    console.log(`\nTo get started:\n  cd ${targetDir}\n  simple\n`);
    return;
  }

  const setupTokens = await confirm({
    message: 'Do you want to configure API tokens now?',
    initialValue: true
  });

  if (isCancel(setupTokens)) return;

  if (setupTokens) {
    const keys: Record<string, string> = {};

    const providers = [
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key' },
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key' },
      { key: 'GEMINI_API_KEY', label: 'Gemini API Key' }
    ];

    for (const p of providers) {
      const val = await text({
        message: `Enter ${p.label} (leave empty to skip):`,
        placeholder: 'sk-...'
      });
      if (!isCancel(val) && val.toString().trim().length > 0) {
        keys[p.key] = val.toString().trim();
      }
    }

    if (Object.keys(keys).length > 0) {
      const envContent = Object.entries(keys).map(([k, v]) => `${k}=${v}`).join('\n');
      writeFileSync(join(absTargetDir, '.env'), envContent);
      console.log(pc.green(`✔ Created .env file with ${Object.keys(keys).length} keys.`));
    } else {
      console.log(pc.dim('Skipping .env creation (no keys provided).'));
    }
  }

  console.log(pc.green(pc.bold(`\n✅ Deployment Complete!`)));
  console.log(`\nTo get started:\n  cd ${targetDir}\n  simple\n`);
}
