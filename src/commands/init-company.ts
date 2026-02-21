import { intro, outro, text, confirm, isCancel, cancel } from "@clack/prompts";
import { setupCompany } from "../utils/company-setup.js";

export async function initCompany(companyName?: string) {
    intro(`Simple CLI - Company Initialization`);

    let name = companyName;

    if (name) {
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            cancel(`Invalid company name '${name}'. Only letters, numbers, dashes, and underscores are allowed.`);
            return;
        }
    } else {
        const nameInput = await text({
            message: 'What is the company name?',
            placeholder: 'acme-corp',
            validate(value) {
                if (value.length === 0) return `Value is required!`;
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) return `Only letters, numbers, dashes, and underscores are allowed.`;
            },
        });

        if (isCancel(nameInput)) {
            cancel('Operation cancelled.');
            return;
        }
        name = nameInput as string;
    }

    const shouldConfigure = await confirm({
        message: 'Do you want to configure context details now?',
        initialValue: true,
    });

    if (isCancel(shouldConfigure)) {
        cancel('Operation cancelled.');
        return;
    }

    let context = {};

    if (shouldConfigure) {
        const brandVoice = await text({
            message: 'What is the brand voice?',
            placeholder: 'Professional, innovative...',
        });
        if (isCancel(brandVoice)) { cancel('Operation cancelled.'); return; }

        const goals = await text({
            message: 'What are the main project goals? (comma separated)',
            placeholder: 'Launch MVP, Increase revenue',
        });
        if (isCancel(goals)) { cancel('Operation cancelled.'); return; }

        const techStack = await text({
            message: 'What is the tech stack? (comma separated)',
            placeholder: 'React, Node.js, AWS',
        });
        if (isCancel(techStack)) { cancel('Operation cancelled.'); return; }

        context = {
            brand_voice: brandVoice,
            project_goals: (goals as string).split(',').map(s => s.trim()).filter(Boolean),
            tech_stack: (techStack as string).split(',').map(s => s.trim()).filter(Boolean),
        };
    }

    try {
        await setupCompany(name, context);
        outro(`Company '${name}' initialized successfully!`);
    } catch (e: any) {
        cancel(`Failed to initialize company: ${e.message}`);
    }
}
