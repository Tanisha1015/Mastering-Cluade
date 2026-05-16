# 🛡️ Project Sentinel — Autonomous Incident Resolution Engine

> **Built for the Mastering Claude Code Capstone**
> A fully autonomous DevOps monitoring system that detects service failures, spawns AI subagents to debug and fix them, and verifies recovery — without human intervention.

---

## What It Does

Project Sentinel is a mock production environment consisting of:

- **4 Node.js microservices** simulating real-world services (auth, payment, inventory, notification)
- **A Chaos Monkey** that randomly injects real bugs into the service code
- **A Sentinel Agent** that autonomously detects failures, dispatches Claude subagents to fix them, and runs regression tests
- **A real-time Next.js dashboard** showing live service health, active incidents, and resolution history

The entire resolution pipeline — from detection to fix to verification — runs **without a human touching the keyboard**.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Dashboard                   │
│          (Active Incidents / Resolved by Claude)     │
└───────────────────┬─────────────────────────────────┘
                    │ polls every 1s
                    ▼
┌─────────────────────────────────────────────────────┐
│              API Server (:3099)                      │
│        Express REST API → SQLite Database            │
└───────────────────┬─────────────────────────────────┘
                    │ reads/writes
                    ▼
┌─────────────────────────────────────────────────────┐
│           Health Check Poller                        │
│   Polls all 4 services every 3s → creates incidents │
└───────────────────┬─────────────────────────────────┘
                    │ detects failures
                    ▼
┌─────────────────────────────────────────────────────┐
│              Sentinel Agent                          │
│   Main Agent → Subagent Alpha → Subagent Beta        │
│   (Orchestrate)   (Debug/Fix)   (Regression Tests)  │
└───────────────────┬─────────────────────────────────┘
                    │ fixes files
                    ▼
┌─────────────────────────────────────────────────────┐
│    Microservices (auth / payment / inventory /       │
│                   notification)                      │
│    Ports: 3101 / 3102 / 3103 / 3104                 │
└─────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start everything (services + health poller + API + dashboard)
```bash
npm run dev
```

### 3. Inject chaos (4 unique bugs, 1 per service)
```bash
node scripts/chaosMonkey.js
```

### 4. Watch the Sentinel Agent autonomously fix everything
```bash
npm run sentinel -- --once
```

### 5. View the dashboard
```
http://localhost:3000
```

---

## Chaos Monkey

The Chaos Monkey injects real file-level bugs that break the services:

| Bug Code | Type | Effect |
|----------|------|--------|
| CM-001 | Syntax Error | Prepends invalid JS to `index.js` — crashes on start |
| CM-002 | Missing Dependency | Removes `express` require — `ReferenceError` on start |
| CM-003 | Logic Error | Changes `/health` to return `CRITICAL` — service runs but lies |
| CM-004 | JSON Corruption | Corrupts `package.json` — npm metadata invalid |

```bash
# Auto-inject (1 unique bug per service)
node scripts/chaosMonkey.js

# Manual injection (your choice)
node scripts/chaosMonkey.js --service payment-service --bug CM-001

# Restore everything
node scripts/chaosMonkey.js --restore

# Help
node scripts/chaosMonkey.js --help
```

---

## Sentinel Agent

The agent autonomously:

1. **Detects** — reads `.chaos-event.json` and the SQLite incident database
2. **Plans** — uses structured resolution protocol from `CLAUDE.md`
3. **Dispatches Subagent Alpha** — restores the corrupted file from backup
4. **Dispatches Subagent Beta** — writes regression tests
5. **Verifies** — restarts the service, checks `/health`, confirms HEALTHY
6. **Documents** — appends to `docs/incident-history.log`

```bash
npm run sentinel -- --once
```

---

## Project Structure

```
project-sentinel/
├── app/                    # Next.js dashboard (port 3000)
├── services/
│   ├── auth-service/       # JWT validation service (port 3101)
│   ├── payment-service/    # Payment gateway service (port 3102)
│   ├── inventory-service/  # Stock management service (port 3103)
│   └── notification-service/ # Alert service (port 3104)
├── scripts/
│   ├── chaosMonkey.js      # Bug injector
│   ├── sentinel-agent.js   # Autonomous resolution engine
│   ├── healthCheck.js      # Service health poller
│   └── apiServer.js        # Dashboard REST API
├── database/
│   └── db.js               # SQLite wrapper (sql.js)
├── docs/
│   ├── incident-history.log # Resolution audit trail
│   └── agent-session-log.txt # Exported Claude session
└── CLAUDE.md               # Agent resolution protocol
```

---

## Deliverables

| File | Description |
|------|-------------|
| `CLAUDE.md` | Resolution protocol — context file read by the Sentinel Agent before every action |
| `docs/incident-history.log` | Audit trail of every incident detected and resolved |
| `docs/agent-session-log.txt` | Exported text log of a full autonomous resolution session demonstrating `/subagent` and `/plan` |

---

## Tech Stack

- **Dashboard**: Next.js 15, TypeScript, Vanilla CSS (dark mode, glassmorphism)
- **Services**: Node.js 20+, Express 5, CommonJS
- **Database**: SQLite via `sql.js` (zero native compilation)
- **Monitoring**: Custom HTTP health poller (3s interval)
- **Chaos**: File-level code injection (real bugs, not mocks)
- **Agent**: Claude Code CLI (`claude`) with multi-agent orchestration

---

*Project Sentinel — Built with Claude Code · Mastering Claude Code Capstone 2026*
