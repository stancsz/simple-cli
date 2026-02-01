
import 'dotenv/config';
import '../src/providers/index.js'; // Just import to trigger side effects
import pc from 'picocolors';

console.log(pc.green('✅ Imports loaded successfully.'));
process.exit(0);
