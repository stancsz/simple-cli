/**
 * Simple-CLI Discord Integration Example
 *
 * Prerequisites:
 * npm install discord.js dotenv @stan-chen/simple-cli
 */
const { Client, GatewayIntentBits } = require('discord.js');
const { execFile } = require('child_process');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Simple command parsing: "!simple <task>"
  if (message.content.startsWith('!simple')) {
    const task = message.content.replace('!simple', '').trim();

    if (!task) {
      await message.reply('Please provide a task. Example: `!simple check disk usage`');
      return;
    }

    const reply = await message.reply(`🧠 **Processing:** "${task}"...`);

    // Execute Simple-CLI securely using execFile
    execFile('simple', ['.', task, '--yolo'], { env: process.env }, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        await reply.edit(`❌ **Error**: ${error.message}`);
        return;
      }

      // Discord has a 2000 char limit
      const output = stdout.length > 1900 ? stdout.substring(0, 1900) + '...' : stdout;

      await reply.edit(`✅ **Result:**\n\`\`\`\n${output}\n\`\`\``);
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
