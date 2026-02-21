#!/usr/bin/env ts-node

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const AGENT_DIR = path.join(process.cwd(), '.agent');
const COMPANIES_DIR = path.join(AGENT_DIR, 'companies');

const main = async () => {
  console.log('🚀 Simple-CLI Company Context Wizard 🚀');
  console.log('-----------------------------------------');

  const companyIdRaw = await question('Enter Company ID (slug, e.g., client-a): ');
  const companyId = companyIdRaw.trim();

  if (!companyId) {
    console.error('Company ID is required.');
    rl.close();
    process.exit(1);
  }

  const displayName = await question('Enter Display Name (e.g., Client A Inc.): ');
  const role = await question('Enter Persona Role (e.g., DevOps Engineer): ');
  const tone = await question('Enter Persona Tone (e.g., Professional, witty): ');

  const companyDir = path.join(COMPANIES_DIR, companyId);
  const configDir = path.join(companyDir, 'config');
  const docsDir = path.join(companyDir, 'docs');

  console.log(`\nCreating directories for ${companyId}...`);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const personaConfig = {
    name: `${companyId}_Agent`,
    role: role || 'Assistant',
    voice: {
      tone: tone || 'Helpful and professional'
    },
    emoji_usage: true,
    catchphrases: {
        greeting: [`Hello from ${displayName}!`, "Hi team!"],
        signoff: ["Best regards,", "Cheers!"]
    },
    working_hours: "09:00-17:00",
    response_latency: {
      min: 500,
      max: 2000
    },
    enabled: true
  };

  const personaPath = path.join(configDir, 'persona.json');
  fs.writeFileSync(personaPath, JSON.stringify(personaConfig, null, 2));
  console.log(`✅ Created persona configuration at ${personaPath}`);

  const readmePath = path.join(docsDir, 'README.md');
  fs.writeFileSync(readmePath, `# ${displayName}\n\nThis is the documentation folder for ${displayName}. Add your specs, brand guidelines, and other docs here.`);
  console.log(`✅ Created documentation folder at ${docsDir}`);

  console.log('\n🎉 Company Context Setup Complete! 🎉');
  console.log('To run the agent with this context:');
  console.log(`  npm start -- --company ${companyId}`);
  console.log('Or via Docker:');
  console.log(`  docker-compose run agent --company ${companyId}`);

  rl.close();
};

main().catch(console.error);
