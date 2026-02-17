# Simple CLI Automated Jobs (Docker Cron)

This setup runs the job delegator and code reviewer locally using Docker Compose with cron scheduling.

## Schedule

- **Job Delegator**: Runs at `:00` and `:30` every hour (delegates 1 task per run)
- **Code Reviewer**: Runs at `:15` and `:45` every hour (reviews all open PRs)

## Prerequisites

1. Docker and Docker Compose installed
2. Environment variables configured (see below)

## Setup

### 1. Create `.env` file

Create a `.env` file in the project root with your API keys:

```bash
JULES_API_KEY=your_jules_api_key
GITHUB_TOKEN=your_github_token
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key
```

### 2. Start the cron service

```bash
docker-compose -f docker-compose.cron.yml up -d
```

### 3. View logs

```bash
# View all logs
docker-compose -f docker-compose.cron.yml logs -f

# View delegator logs only
tail -f logs/cron/delegator.log

# View reviewer logs only
tail -f logs/cron/reviewer.log
```

### 4. Stop the service

```bash
docker-compose -f docker-compose.cron.yml down
```

## How It Works

### Job Delegator
- Analyzes the roadmap, specs, and current progress
- Identifies the next highest-priority task
- Delegates **exactly 1 task** to Jules per run
- Runs every 30 minutes at `:00` and `:30`

### Code Reviewer
- Reviews all open PRs
- Checks for conflicts and resolves them automatically
- Runs tests on each PR
- **Prioritizes merging** unless code breaks or isn't meaningful
- Runs every 30 minutes at `:15` and `:45`

## Configuration

### Adjust Schedule

Edit `crontab` to change the schedule:

```cron
# Current schedule (every 30 minutes)
0,30 * * * * cd /app && npx tsx .github/scripts/job-delegator.ts >> /var/log/cron/delegator.log 2>&1
15,45 * * * * cd /app && npx tsx .github/scripts/review.ts >> /var/log/cron/reviewer.log 2>&1

# Example: Run every hour instead
0 * * * * cd /app && npx tsx .github/scripts/job-delegator.ts >> /var/log/cron/delegator.log 2>&1
15 * * * * cd /app && npx tsx .github/scripts/review.ts >> /var/log/cron/reviewer.log 2>&1
```

After changing the crontab, rebuild and restart:

```bash
docker-compose -f docker-compose.cron.yml up -d --build
```

### Adjust Timezone

Edit `docker-compose.cron.yml` and change the `TZ` environment variable:

```yaml
environment:
  - TZ=America/New_York  # Change to your timezone
```

## Troubleshooting

### Check if cron is running

```bash
docker exec simple-cli-cron ps aux | grep crond
```

### Check cron logs

```bash
docker exec simple-cli-cron cat /var/log/cron/delegator.log
docker exec simple-cli-cron cat /var/log/cron/reviewer.log
```

### Manually trigger a job

```bash
# Trigger job delegator
docker exec simple-cli-cron npx tsx .github/scripts/job-delegator.ts

# Trigger code reviewer
docker exec simple-cli-cron npx tsx .github/scripts/review.ts
```

### Rebuild after code changes

```bash
docker-compose -f docker-compose.cron.yml up -d --build
```

## Notes

- The job delegator now delegates **only 1 task per run** to avoid overwhelming Jules
- The code reviewer prioritizes merging PRs to avoid conflicts piling up
- Logs are persisted in `logs/cron/` directory
- The `.agent` directory is mounted for persistent memory across runs
- Git operations work because `.git` is mounted into the container
