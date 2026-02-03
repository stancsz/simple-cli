import fs from 'fs';
import pc from 'picocolors';
import { join } from 'path';

export function runDeterministicOrganizer(targetDir: string) {
  try {
    console.log(pc.yellow('⚙ Running deterministic organizer fallback...'));
    const photosDir = join(targetDir, 'Photos');
    const docsDir = join(targetDir, 'Documents');
    const trashDir = join(targetDir, 'Trash');
    const expensesPath = join(targetDir, 'Expenses.csv');
    if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });

    const entries = fs.readdirSync(targetDir);
    for (const f of entries) {
      const src = join(targetDir, f);
      try {
        const stat = fs.statSync(src);
        if (!stat.isFile()) continue;
      } catch { continue; }

      const lower = f.toLowerCase();
      try {
        if (lower.endsWith('.jpg') || lower.endsWith('.png')) {
          console.log(pc.dim(`  -> Moving ${f} to Photos`));
          fs.renameSync(src, join(photosDir, f));
        } else if (lower.endsWith('.pdf') || lower.endsWith('.docx')) {
          console.log(pc.dim(`  -> Moving ${f} to Documents`));
          fs.renameSync(src, join(docsDir, f));
        } else if (lower.endsWith('.exe') || lower.endsWith('.msi')) {
          console.log(pc.dim(`  -> Moving ${f} to Trash`));
          fs.renameSync(src, join(trashDir, f));
        } else if ((lower.includes('receipt') || lower.startsWith('receipt')) && lower.endsWith('.txt')) {
          const content = fs.readFileSync(src, 'utf-8');
          const m = content.match(/Total:\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i);
          if (m) {
            const line = `${new Date().toISOString().split('T')[0]},${m[1]},${f}\n`;
            if (!fs.existsSync(expensesPath)) fs.appendFileSync(expensesPath, 'Date,Amount,Description\n');
            fs.appendFileSync(expensesPath, line);
            console.log(pc.dim(`  -> Logged receipt: ${f}`));
          }
          console.log(pc.dim(`  -> Moving ${f} to Documents`));
          fs.renameSync(src, join(docsDir, f));
        }
      } catch (err) {
        console.error(pc.red(`  ! Failed to process ${f}:`), err instanceof Error ? err.message : err);
      }
    }
    console.log(pc.green('✔ Deterministic organizer finished'));
  } catch (err) {
    console.error('Fallback organizer failed:', err);
  }
}
