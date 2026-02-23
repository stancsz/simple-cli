import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const COMPANIES = [
  'acme-corp',
  'beta-tech',
  'gamma-solutions',
  'delta-systems',
  'epsilon-enterprises'
];

async function setup() {
  const baseDir = process.argv[2] || join(process.cwd(), '.agent_stress_test');
  console.log(`Setting up stress test environment in: ${baseDir}`);

  await mkdir(baseDir, { recursive: true });

  // 1. Create Company Directories
  for (const company of COMPANIES) {
    const companyDir = join(baseDir, '.agent', 'companies', company);
    await mkdir(companyDir, { recursive: true });

    // Create persona.json
    const persona = {
      name: `Agent-${company}`,
      voice: "professional",
      working_hours: { start: "09:00", end: "17:00" },
      timezone: "UTC"
    };
    await mkdir(join(companyDir, 'config'), { recursive: true });
    await writeFile(join(companyDir, 'config', 'persona.json'), JSON.stringify(persona, null, 2));

    // Create Brain Directory (just to ensure it exists for lance connector)
    const brainDir = join(baseDir, '.agent', 'brain', company);
    await mkdir(brainDir, { recursive: true });

    console.log(`Created context for ${company}`);
  }

  // 2. Create Shared SOPs Directory
  const sopsDir = join(baseDir, 'sops');
  await mkdir(sopsDir, { recursive: true });

  // Create a 50-step SOP
  let sopContent = `# Production Deployment SOP\n\n`;
  for (let i = 1; i <= 50; i++) {
    sopContent += `${i}. Step ${i}: Execute deployment phase ${i}\n`;
    // Add some complexity description
    sopContent += `   - Verify checks for phase ${i}\n`;
    sopContent += `   - Log progress\n\n`;
  }

  await writeFile(join(sopsDir, 'production_deploy.md'), sopContent);
  console.log(`Created 50-step SOP at ${join(sopsDir, 'production_deploy.md')}`);

  // 3. Create dummy mcp.json (will be overwritten by test runner, but good to have base)
  await writeFile(join(baseDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2));

  console.log("Setup Complete.");
}

setup().catch(console.error);
