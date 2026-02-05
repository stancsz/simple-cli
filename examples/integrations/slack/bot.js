/**
 * Simple-CLI Slack Integration Example
 *
 * Prerequisites:
 * npm install @slack/bolt dotenv @stan-chen/simple-cli
 */
const { App } = require('@slack/bolt');
const { execFile } = require('child_process');
require('dotenv').config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Listen for mentions
app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@.*?>/g, '').trim();

  if (!text) {
    await say(`Hello <@${event.user}>! How can I help you today?`);
    return;
  }

  await say(`Thinking... \n> ${text}`);

  // Execute Simple-CLI securely using execFile
  // This avoids shell injection vulnerabilities by passing arguments as an array.
  execFile('simple', ['.', text, '--yolo'], { env: process.env }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      say(`:warning: **Error**: ${error.message}`);
      return;
    }

    if (stderr) {
      console.error(`Stderr: ${stderr}`);
    }

    // Truncate output if too long for Slack
    const output = stdout.length > 3000 ? stdout.substring(0, 3000) + '...' : stdout;

    say(`:white_check_mark: **Task Completed**\n\`\`\`\n${output}\n\`\`\``);
  });
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Slack Simple-CLI Bot is running!');
})();
