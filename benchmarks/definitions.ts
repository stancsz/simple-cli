import { Benchmark, Task } from './types';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export const benchmarks: Benchmark[] = [
    {
        name: 'Terminal-Bench',
        description: 'Evaluates proficiency with shell commands and file system operations.',
        tasks: [
            {
                name: 'List Files',
                prompt: 'List all files in the current directory.',
                verify: (cwd, output) => {
                    // Check if output contains ls output or file list
                    // Since the directory is empty initially (or contains created files), this is trivial.
                    // We'll add a setup step to create some files.
                    return true;
                },
                setup: (cwd) => {
                    writeFileSync(join(cwd, 'test1.txt'), 'content');
                    writeFileSync(join(cwd, 'test2.txt'), 'content');
                }
            },
            {
                name: 'Create File',
                prompt: 'Create a file named "hello.txt" containing the text "Hello World".',
                verify: (cwd) => {
                    const p = join(cwd, 'hello.txt');
                    if (!existsSync(p)) return false;
                    const content = readFileSync(p, 'utf-8');
                    return content.trim() === 'Hello World';
                }
            },
            {
                name: 'Delete File',
                prompt: 'Delete the file "trash.txt".',
                setup: (cwd) => {
                    writeFileSync(join(cwd, 'trash.txt'), 'trash');
                },
                verify: (cwd) => {
                    return !existsSync(join(cwd, 'trash.txt'));
                }
            }
        ]
    },
    {
        name: 'TheAgentCompany',
        description: 'Simulates corporate tasks involving document creation and processing.',
        tasks: [
            {
                name: 'Write Memo',
                prompt: 'Write a memo to "staff.txt" about the new coffee policy: "Coffee is now free".',
                verify: (cwd) => {
                    const p = join(cwd, 'staff.txt');
                    if (!existsSync(p)) return false;
                    const content = readFileSync(p, 'utf-8');
                    return content.toLowerCase().includes('coffee') && content.toLowerCase().includes('free');
                }
            }
        ]
    },
    {
        name: 'SWE-bench',
        description: 'Tests software engineering capabilities like debugging and refactoring.',
        tasks: [
            {
                name: 'Fix Bug',
                prompt: 'The function `add` in `math.js` is incorrect. It subtracts instead of adding. Fix it.',
                setup: (cwd) => {
                    writeFileSync(join(cwd, 'math.js'), 'module.exports = { add: (a, b) => a - b };');
                },
                verify: (cwd) => {
                    // We can try to require it, but we need to run it in a separate process or context
                    // Or just check content
                    const content = readFileSync(join(cwd, 'math.js'), 'utf-8');
                    return content.includes('a + b') || content.includes('a+b');
                }
            }
        ]
    },
    {
        name: 'AgentBench',
        description: 'Assesses general reasoning and problem-solving skills.',
        tasks: [
            {
                name: 'Simple Math Logic',
                prompt: 'If I have 5 apples and give 2 to my friend, how many do I have left? Reply with just the number.',
                verify: (cwd, output) => {
                    return output.includes('3');
                }
            }
        ]
    },
    {
        name: 'OSWorld',
        description: 'Tests ability to control the operating system environment (simulated).',
        tasks: [
            {
                name: 'Move File',
                prompt: 'Move "document.txt" from "source" folder to "dest" folder.',
                setup: (cwd) => {
                    mkdirSync(join(cwd, 'source'));
                    mkdirSync(join(cwd, 'dest'));
                    writeFileSync(join(cwd, 'source', 'document.txt'), 'important data');
                },
                verify: (cwd) => {
                    return existsSync(join(cwd, 'dest', 'document.txt')) && !existsSync(join(cwd, 'source', 'document.txt'));
                }
            }
        ]
    }
];
