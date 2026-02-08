import pc from 'picocolors';

import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf8'));

export function showBanner() {
  const cat = `
      /\\_/\\
     ( o.o )
      > ^ <
    `;

  console.log(pc.magenta(cat));
  console.log(` ${pc.bgMagenta(pc.black(' SIMPLE-CLI '))} ${pc.dim(`v${pkg.version}`)}\n`);
}
