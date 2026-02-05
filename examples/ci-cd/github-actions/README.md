# GitHub Actions Deployment

This directory contains an example GitHub Actions workflow to deploy Simple-CLI as an automated agent in your CI/CD pipeline.

## Usage

1.  Copy `main.yml` to your repository's `.github/workflows/` directory.
2.  Add your `OPENAI_API_KEY` (or other provider key) to your repository's secrets.
    *   Go to **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
3.  The workflow will automatically run on pushes to `main`.
4.  You can also manually trigger it via the **Actions** tab with a custom task description.

## Workflow Details

The workflow:
1.  Checks out your code.
2.  Installs Node.js.
3.  Installs `@stan-chen/simple-cli` globally.
4.  Runs `simple` with the `--yolo` flag to bypass interactive confirmation prompts, allowing the agent to execute autonomously.

## Customization

You can modify the command in the `run` step to use specific personas or flags:

```yaml
run: |
  export CLAW_WORKSPACE=$(pwd)/examples/qa-automation
  simple . "Run full regression tests" --claw "QA Specialist" --yolo
```
