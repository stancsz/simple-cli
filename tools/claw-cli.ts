#!/usr/bin/env node
/**
 * CLI wrapper for claw tool
 * Usage: node tools/claw-cli.js <action> [skillName] [args...]
 */

import { tool } from './claw.js';

const args = process.argv.slice(2);

if (args.length < 1) {
    console.error('Usage: claw-cli.js <action> [skillName] [args...]');
    console.error('Actions: list, inspect, run');
    process.exit(1);
}

const action = args[0];
const skillName = args[1];

// Parse remaining args as key=value pairs
const skillArgs: Record<string, any> = {};
for (let i = 2; i < args.length; i++) {
    const match = args[i].match(/^(\w+)=(.+)$/);
    if (match) {
        // Remove surrounding quotes if present
        skillArgs[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
}

tool.execute({ action, skillName, args: skillArgs })
    .then(result => {
        console.log(result);
        process.exit(0);
    })
    .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
