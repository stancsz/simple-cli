# 🎭 CLAW PERSONA GALLERY

**Unlock the full potential of your AI partner.**

The `examples/` directory contains specialized persona definitions ("SOULs") for various professional roles. These personas transform the generic agent into a highly specialized expert.

## 🚀 How to Use a Persona

There are two ways to activate a persona:

### Method 1: The `CLAW_WORKSPACE` Environment Variable (Recommended)

Point the `CLAW_WORKSPACE` variable to the persona's directory. This keeps your project clean.

```bash
# Linux/Mac
export CLAW_WORKSPACE=$(pwd)/examples/data-engineer
simple --claw "Analyze the ETL pipeline in /src/etl"

# Windows (PowerShell)
$env:CLAW_WORKSPACE="$(pwd)\examples\data-engineer"
simple --claw "Analyze the ETL pipeline in src/etl"
```

### Method 2: Local Project Injection

Copy the `SOUL.md` file directly into your project's root or `.simple/` directory.

```bash
cp examples/qa-automation/SOUL.md .simple/SOUL.md
simple --claw "Run regression tests"
```

---

## 📂 Available Personas

### 🛠️ Technical & Engineering
- **[Data Engineer](data-engineer/SOUL.md)**: Builds robust, scalable pipelines. Focuses on idempotency and schema validation.
- **[Data Scientist](data-scientist/SOUL.md)**: Analyzes data, tests hypotheses, and creates visualizations.
- **[QA Automation](qa-automation/SOUL.md)**: The Quality Guardian. Focuses on test coverage and regression prevention.
- **[Cybersecurity Analyst](cybersecurity-analyst/SOUL.md)**: The Shield. Audits code, detects threats, and enforces security.

### 💼 Business & Leadership
- **[Product Director](product-director/SOUL.md)**: The North Star. Focuses on roadmap, user value, and prioritization.
- **[Marketing Director](marketing-director/SOUL.md)**: The Brand Visionary. Drives engagement, strategy, and ROI.
- **[Business Dev Director](business-development-director/SOUL.md)**: The Growth Strategist. Focuses on partnerships and expansion.
- **[Sales Representative](sales-representative/SOUL.md)**: The Rainmaker. Focuses on persuasion, value, and closing.

### 🤝 Support & Operations
- **[Customer Support](customer-support/SOUL.md)**: The Empathy Engine. De-escalates and resolves user issues.
- **[Executive Assistant](executive-assistant/SOUL.md)**: The Force Multiplier. Organizes, schedules, and summarizes.

---

## 🎨 Create Your Own

Want to build a custom persona?
1. Create a `SOUL.md` file.
2. Define the **Identity** (Who are they?).
3. Define **Prime Directives** (What matters most?).
4. Define **Operational Protocols** (How do they work?).
