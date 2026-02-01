# 🧬 Claw Mode Implementation - Debug & Fix Summary

## 📋 **What We Built**

A fully autonomous `-claw` mode for Simple-CLI that:
1. Generates a specialized JIT (Just-In-Time) agent based on user intent
2. Executes tasks autonomously without user interaction
3. Exits automatically when the task is complete

## 🔍 **Bugs Found & Fixed**

### **Bug #1: Wrong Working Directory for JIT Generator**
**Problem**: JIT generator was running in the project root instead of the target directory
- **Root Cause**: Claw mode handling happened before `process.chdir(targetDir)`
- **Fix**: Moved claw mode handling to AFTER directory change in `main()`
- **File**: `src/cli.ts` lines 133-161

### **Bug #2: Intent Included Directory Path**
**Problem**: Intent was `"demo_downloads Every hour..."` instead of just `"Every hour..."`
- **Root Cause**: `args.join(' ')` included ALL non-flag args before directory was shifted
- **Fix**: Parse intent AFTER `args.shift()` removes the directory
- **File**: `src/cli.ts` line 138

### **Bug #3: Claw Tool CWD Issues**
**Problem**: `tools/claw.ts` couldn't find skills when run from different directory
- **Root Cause**: `CLAW_LOCAL_PATH` was set at module load time to `process.cwd()`
- **Fix**: Directly invoke `jit-generator.cjs` instead of using claw wrapper
- **File**: `src/cli.ts` lines 145-155

### **Bug #4: No Autonomous Execution**
**Problem**: Agent entered interactive chat mode instead of executing and exiting
- **Root Cause**: No logic to detect autonomous mode and exit after task completion
- **Fix**: Added `isAutonomousMode` flag and exit logic after first iteration
- **Files**: `src/cli.ts` lines 201, 209-215, 310-318

### **Bug #5: Original CWD Lost After chdir**
**Problem**: Couldn't find `jit-generator.cjs` after changing to target directory
- **Root Cause**: `process.cwd()` changed but we needed original path for scripts
- **Fix**: Save `originalCwd` before any directory changes
- **File**: `src/cli.ts` line 118, 145

## ✅ **Final Implementation**

### **Key Components:**

1. **JIT Agent Generator** (`skills/claw-jit/jit-generator.cjs`)
   - Creates specialized AGENT.md based on intent
   - Stores in `.simple/workdir/AGENT.md` in target directory
   - Falls back to template if LLM unavailable

2. **Autonomous Mode** (`src/cli.ts`)
   - Detects `-claw` flag
   - Generates JIT agent
   - Executes task autonomously
   - Shows execution summary
   - Exits automatically

3. **Scheduler Tool** (`src/tools/scheduler.ts`)
   - Cross-platform task scheduling
   - Windows: `schtasks`
   - Unix/Mac: `crontab`

### **Usage:**

```bash
# Basic usage
simple demo_downloads -claw "Organize my files"

# Full example
simple ~/downloads -claw "Every hour, scan my Downloads folder. Sort images into /Photos, docs into /Documents, and installers into /Trash. If you find a receipt, extract the total and log it to my Expenses spreadsheet."
```

### **Execution Flow:**

```
1. Parse args → Extract target directory
2. Change to target directory
3. Generate JIT agent soul → .simple/workdir/AGENT.md
4. Initialize context with JIT agent rules
5. Execute task autonomously (YOLO mode)
6. Show execution summary
7. Exit
```

## 🎯 **Test Results**

### **What Works:**
✅ JIT agent generation in correct directory  
✅ Intent parsing (no directory in intent)  
✅ Autonomous mode detection  
✅ Auto-exit after task completion  
✅ Execution summary display  
✅ YOLO mode (no confirmations)  

### **What Needs Work:**
⚠️ **Actual file organization** - Agent generates response but doesn't execute tools
- The agent loop completes but files aren't moved
- This is because the LLM response format doesn't match the expected tool call format
- Need to improve prompt to ensure agent uses tools correctly

## 📝 **Next Steps**

To make the demo fully functional:

1. **Fix Tool Execution**: Update system prompt to ensure agent calls tools in correct format
2. **Add File Operations**: Ensure `writeFiles` tool can move files
3. **Receipt Parsing**: Add OCR or text extraction for receipt totals
4. **Scheduler Integration**: Have agent call scheduler tool to set up recurring execution

## 🗂️ **Files Modified**

- `src/cli.ts` - Main CLI logic, claw mode handling
- `src/prompts/provider.ts` - Added `.simple/workdir/AGENT.md` to search paths
- `src/tools/scheduler.ts` - NEW: Cross-platform task scheduler
- `tools/claw-cli.ts` - NEW: CLI wrapper for claw tool
- `demo-claw.js` - NEW: Standalone demo script
- `tests/live/claw-demo.test.ts` - NEW: Automated test

## 🎓 **Lessons Learned**

1. **Order Matters**: Directory changes must happen before path-dependent operations
2. **CWD is Mutable**: Always save original cwd if you need it later
3. **Module Load Time**: Variables set at module load time don't update with cwd changes
4. **Autonomous vs Interactive**: Need clear mode detection and different control flow
5. **Direct Invocation**: Sometimes bypassing wrappers is simpler than fixing path issues

---

**Status**: ✅ Core infrastructure complete, ready for tool execution improvements
**Date**: 2026-01-31
**Version**: 0.2.2
