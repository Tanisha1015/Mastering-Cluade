/**
 * scripts/chaosMonkey.js
 * The Chaos Monkey — randomly introduces bugs into the microservices.
 *
 * Introduces 5 types of bugs:
 *   CM-001: Syntax Error      — corrupts a JS file with invalid syntax
 *   CM-002: Missing Dependency — removes a require() call
 *   CM-003: Logic Error       — changes a variable name or return value
 *   CM-004: JSON Corruption   — corrupts a package.json file
 *
 * Usage: node scripts/chaosMonkey.js [--service <name>] [--bug <CM-001|CM-002|..>]
 * If no args given, picks a random service and random bug type.
 *
 * IMPORTANT: The Chaos Monkey saves a backup of every file it modifies
 * so the Sentinel Agent can restore them.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT_DIR     = path.join(__dirname, '..');
const SERVICES_DIR = path.join(ROOT_DIR, 'services');
const BACKUP_DIR   = path.join(ROOT_DIR, '.chaos-backups');
const CHAOS_LOG    = path.join(ROOT_DIR, 'services', 'logs', 'chaos.log');

// Ensure backup and log directories exist
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const logsDir = path.join(ROOT_DIR, 'services', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// All available target services
const SERVICE_NAMES = [
  'auth-service',
  'payment-service',
  'inventory-service',
  'notification-service',
];

// Port mapping for CM-005 (port conflict injection)
const SERVICE_PORTS = {
  'auth-service':         3101,
  'payment-service':      3102,
  'inventory-service':    3103,
  'notification-service': 3104,
};

// All bug types
const BUG_TYPES = ['CM-001', 'CM-002', 'CM-003', 'CM-004'];

/**
 * Write a chaos event to the chaos log.
 */
function logChaos(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [CHAOS-MONKEY] ${message}\n`;
  fs.appendFileSync(CHAOS_LOG, entry);
  console.log(entry.trim());
}

/**
 * Back up a file before modifying it.
 * @param {string} filePath - Absolute path to the file to back up.
 * @returns {string} Path to the backup file.
 */
function backupFile(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '_').replace(/\//g, '_');
  const backupPath = path.join(BACKUP_DIR, `${relativePath}.bak`);

  // Only back up if a backup doesn't already exist — protects the clean original
  // from being overwritten when multiple chaos bugs are stacked on the same file.
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    logChaos(`📦 Backed up: ${filePath} → ${backupPath}`);
  } else {
    logChaos(`📦 Backup already exists, skipping: ${backupPath}`);
  }
  return backupPath;
}

/**
 * Restore a file from its backup.
 * @param {string} filePath - Absolute path to the original file.
 */
function restoreFile(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '_').replace(/\//g, '_');
  const backupPath = path.join(BACKUP_DIR, `${relativePath}.bak`);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`No backup found for: ${filePath}`);
  }

  fs.copyFileSync(backupPath, filePath);
  fs.unlinkSync(backupPath);
  logChaos(`✅ Restored: ${filePath}`);
}

// =============================================================================
// Bug Injection Functions
// =============================================================================

/**
 * CM-001: Syntax Error
 * Inserts a syntax error at the top of the service's index.js.
 */
function injectSyntaxError(serviceName) {
  const targetFile = path.join(SERVICES_DIR, serviceName, 'index.js');

  if (!fs.existsSync(targetFile)) {
    throw new Error(`Target file not found: ${targetFile}`);
  }

  backupFile(targetFile);
  const content = fs.readFileSync(targetFile, 'utf8');

  // Insert an invalid JavaScript token on line 1
  const corrupted = `THIS IS A SYNTAX ERROR INJECTED BY CHAOS MONKEY (CM-001) <><>\n` + content;
  fs.writeFileSync(targetFile, corrupted, 'utf8');

  logChaos(`💥 CM-001 SYNTAX ERROR injected into ${serviceName}/index.js`);
  return { bugType: 'CM-001', service: serviceName, file: targetFile, description: 'Syntax error on line 1' };
}

/**
 * CM-002: Missing Dependency
 * Removes the first require() statement from index.js (usually 'express').
 */
function injectMissingDependency(serviceName) {
  const targetFile = path.join(SERVICES_DIR, serviceName, 'index.js');

  if (!fs.existsSync(targetFile)) {
    throw new Error(`Target file not found: ${targetFile}`);
  }

  backupFile(targetFile);
  let content = fs.readFileSync(targetFile, 'utf8');

  // Remove the express require statement (first require line)
  const requireRegex = /^const express = require\('express'\);/m;
  if (!requireRegex.test(content)) {
    throw new Error(`Could not find express require statement in ${serviceName}`);
  }

  content = content.replace(requireRegex, '// REMOVED BY CHAOS MONKEY (CM-002): const express = require("express");');
  fs.writeFileSync(targetFile, content, 'utf8');

  logChaos(`💥 CM-002 MISSING DEPENDENCY injected into ${serviceName}/index.js — removed express require`);
  return { bugType: 'CM-002', service: serviceName, file: targetFile, description: 'express require() removed' };
}

/**
 * CM-003: Logic Error
 * Changes the health check status response from 'HEALTHY' to 'CRITICAL',
 * causing the service to report itself as broken even though it's running.
 */
function injectLogicError(serviceName) {
  const targetFile = path.join(SERVICES_DIR, serviceName, 'index.js');

  if (!fs.existsSync(targetFile)) {
    throw new Error(`Target file not found: ${targetFile}`);
  }

  backupFile(targetFile);
  let content = fs.readFileSync(targetFile, 'utf8');

  // Change the health endpoint status value
  const healthyPattern = /status: 'HEALTHY',/g;
  if (!healthyPattern.test(content)) {
    throw new Error(`Could not find health status in ${serviceName}`);
  }

  content = content.replace(/status: 'HEALTHY',/g, "status: 'CRITICAL', /* CM-003: LOGIC ERROR — was 'HEALTHY' */");
  fs.writeFileSync(targetFile, content, 'utf8');

  logChaos(`💥 CM-003 LOGIC ERROR injected into ${serviceName}/index.js — health status changed to CRITICAL`);
  return { bugType: 'CM-003', service: serviceName, file: targetFile, description: 'Health status changed from HEALTHY to CRITICAL' };
}

/**
 * CM-004: JSON Corruption
 * Corrupts the service's package.json by inserting invalid JSON.
 */
function injectJsonCorruption(serviceName) {
  const targetFile = path.join(SERVICES_DIR, serviceName, 'package.json');

  if (!fs.existsSync(targetFile)) {
    throw new Error(`Target file not found: ${targetFile}`);
  }

  backupFile(targetFile);
  let content = fs.readFileSync(targetFile, 'utf8');

  // Insert a corruption marker that breaks JSON parsing
  content = content.replace('"name":', '"name": CHAOS_MONKEY_WAS_HERE,\n  "corrupted":');

  fs.writeFileSync(targetFile, content, 'utf8');

  logChaos(`💥 CM-004 JSON CORRUPTION injected into ${serviceName}/package.json`);
  return { bugType: 'CM-004', service: serviceName, file: targetFile, description: 'package.json corrupted with invalid JSON' };
}



// =============================================================================
// Main Orchestration
// =============================================================================

const BUG_INJECTORS = {
  'CM-001': injectSyntaxError,
  'CM-002': injectMissingDependency,
  'CM-003': injectLogicError,
  'CM-004': injectJsonCorruption,
};

/**
 * Pick a random element from an array.
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Parse command-line arguments.
 * Supports: --service <name> --bug <CM-xxx> --restore --help
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { service: null, bug: null, restore: false, help: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--service' && args[i + 1]) result.service = args[++i];
    if (args[i] === '--bug'     && args[i + 1]) result.bug     = args[++i];
    if (args[i] === '--restore')                result.restore  = true;
    if (args[i] === '--help' || args[i] === '-h') result.help = true;
  }

  return result;
}

/**
 * Print usage information.
 */
function printHelp() {
  console.log(`
📖 CHAOS MONKEY — Usage Guide
${'━'.repeat(55)}

  Default (no args):
    node scripts/chaosMonkey.js
    → Injects 1 unique bug into each of the 4 services

  Manual single injection:
    node scripts/chaosMonkey.js --service <name> --bug <type>

  Restore all files:
    node scripts/chaosMonkey.js --restore

${'━'.repeat(55)}

  Services:
    auth-service          (port 3101)
    payment-service       (port 3102)
    inventory-service     (port 3103)
    notification-service  (port 3104)

  Bug Types:
    CM-001  Syntax Error       — Prepends invalid JS to index.js,
                                 crashes the process on next start
    CM-002  Missing Dependency — Comments out 'express' require(),
                                 crashes the process on next start
    CM-003  Logic Error        — Changes /health response from
                                 'HEALTHY' to 'CRITICAL' (stays up)
    CM-004  JSON Corruption    — Inserts invalid JSON into
                                 package.json (corrupts npm metadata)

${'━'.repeat(55)}

  Examples:
    node scripts/chaosMonkey.js --service payment-service --bug CM-001
    node scripts/chaosMonkey.js --service auth-service --bug CM-003
    node scripts/chaosMonkey.js --service inventory-service --bug CM-002
    node scripts/chaosMonkey.js --restore
`);
}

/**
 * Restore all backed-up service files.
 * Reconstructs paths from the flat backup filename format:
 *   services_auth-service_index.js.bak  → services/auth-service/index.js
 *   services_payment-service_package.json.bak → services/payment-service/package.json
 */
function restoreAll() {
  logChaos('🔄 RESTORE MODE — restoring all backed-up files...');
  const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.bak'));

  if (backups.length === 0) {
    logChaos('No backups found. Nothing to restore.');
    return;
  }

  for (const backup of backups) {
    const backupPath = path.join(BACKUP_DIR, backup);

    // Reconstruct path: services_auth-service_index.js.bak → services/auth-service/index.js
    // The flat name uses underscores as path separators, but service names contain hyphens.
    // Strategy: strip .bak, split on first underscore to get "services",
    // then match known file endings to extract filename.
    const name = backup.replace(/\.bak$/, ''); // e.g. services_auth-service_index.js

    let originalRelative = null;
    // Match services/<service-name>/index.js
    const indexMatch = name.match(/^services_(.+)_index\.js$/);
    const pkgMatch   = name.match(/^services_(.+)_package\.json$/);

    if (indexMatch) {
      originalRelative = `services/${indexMatch[1]}/index.js`;
    } else if (pkgMatch) {
      originalRelative = `services/${pkgMatch[1]}/package.json`;
    } else {
      // Fallback: replace underscores with path separators naively
      originalRelative = name.replace(/_/g, '/');
    }

    const originalPath = path.join(ROOT_DIR, originalRelative);

    try {
      fs.copyFileSync(backupPath, originalPath);
      fs.unlinkSync(backupPath);
      logChaos(`✅ Restored: ${originalPath}`);
    } catch (err) {
      logChaos(`❌ Failed to restore ${backup}: ${err.message}`);
    }
  }
}

/**
 * Kill the process running on a given port (Windows-safe).
 */
function killPort(port, killedPorts) {
  const { execSync } = require('child_process');
  if (killedPorts.has(port)) return;
  try {
    const stdout = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = stdout.split('\n').filter(l => l.includes('LISTENING'));
    if (lines.length > 0) {
      const pid = lines[0].trim().split(/\s+/).pop();
      if (pid && pid !== '0') {
        execSync(`taskkill /F /PID ${pid}`);
        console.log(`     🔪 Killed process ${pid} on port ${port}`);
        killedPorts.add(port);
      }
    }
  } catch (err) {
    console.log(`     ⚠️  Could not kill port ${port}: ${err.message}`);
  }
}

/**
 * Inject exactly 1 random chaos bug per service (4 total — one per service).
 *
 * Rules to ensure correct multi-injection behaviour:
 *  - Each service gets exactly one bug.
 *  - CM-001/CM-002 crash the process → CM-003 (logic error in health response) is
 *    pointless on the same service if it's also getting CM-001/CM-002. So we only
 *    assign CM-003 to a service if no other file-crash bug is assigned to it.
 *  - CM-004 targets package.json (a different file from index.js), so it can
 *    coexist in theory — but since we do 1 bug per service, this is moot.
 *  - Backups are taken BEFORE any injection. The "backup if not exists" guard in
 *    backupFile() ensures that even if the same file is touched twice (not expected
 *    here), the original clean copy is always preserved.
 */
function injectMultiChaos() {
  const results = [];
  const killedPorts = new Set();

  // Shuffle BUG_TYPES so each service gets a UNIQUE bug type (1:1 mapping).
  // We have exactly 4 services and 4 bug types (CM-001..CM-004), so this gives
  // a perfect bijection with no repeats.
  const shuffledBugs = [...BUG_TYPES];
  for (let i = shuffledBugs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledBugs[i], shuffledBugs[j]] = [shuffledBugs[j], shuffledBugs[i]];
  }

  console.log('💥 INJECTING 1 UNIQUE CHAOS BUG PER SERVICE (4 TOTAL)...\n');
  console.log('━'.repeat(55));

  SERVICE_NAMES.forEach((serviceName, idx) => {
    const bugType = shuffledBugs[idx];
    const injector = BUG_INJECTORS[bugType];

    logChaos(`\n🎯 [${idx + 1}/4] Target: ${serviceName} | Bug: ${bugType}`);

    try {
      const result = injector(serviceName);
      results.push({
        ...result,
        injectedAt: new Date().toISOString(),
        restored: false,
      });
      console.log(`  💥 [${idx + 1}/4] ${bugType} → ${serviceName}: ${result.description}`);

      // Kill the service process for bugs that crash the server.
      // CM-003: service stays running (just returns wrong /health status) — no kill.
      // CM-004: corrupts package.json but running process is unaffected — no kill.
      // CM-001, CM-002: crash the process — kill it.
      const crashesBug = bugType === 'CM-001' || bugType === 'CM-002';
      if (crashesBug) {
        const port = SERVICE_PORTS[serviceName];
        if (port) killPort(port, killedPorts);
      } else {
        console.log(`     ℹ️  ${bugType} doesn't crash the process — no kill needed`);
      }
    } catch (err) {
      logChaos(`⚠️  Skipped [${bugType} → ${serviceName}]: ${err.message}`);
    }
  });

  console.log('\n' + '━'.repeat(55));
  console.log(`💥 CHAOS COMPLETE — ${results.length} bug(s) injected!`);
  console.log('━'.repeat(55));
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.bugType}] ${r.service} — ${r.description}`);
  });
  console.log('━'.repeat(55));
  console.log('\n📋 Run the Sentinel Agent to auto-fix all injected bugs:');
  console.log('   npm run sentinel -- --once\n');
  console.log('🔄 Or restore manually:');
  console.log('   node scripts/chaosMonkey.js --restore\n');

  // Persist all events so the Sentinel Agent can read them
  const chaosEventFile = path.join(ROOT_DIR, '.chaos-event.json');
  fs.writeFileSync(chaosEventFile, JSON.stringify(results, null, 2));
}

/**
 * Main entry point.
 */
function main() {
  const args = parseArgs();

  console.log('\n🐒 ==========================================');
  console.log('🐒  CHAOS MONKEY — Project Sentinel');
  console.log('🐒 ==========================================\n');

  // Restore mode
  if (args.restore) {
    restoreAll();
    return;
  }

  // ── HELP ──────────────────────────────────────────────────────────────────────
  if (args.help) {
    printHelp();
    return;
  }

  // ── DEFAULT (no args): inject 1 unique bug per service ───────────────────────
  if (!args.service && !args.bug) {
    injectMultiChaos();
    return;
  }

  // ── EXPLICIT mode: --service <name> --bug <CM-xxx> ────────────────────────────
  if (!args.service || !args.bug) {
    console.error('❌ Both --service and --bug are required for manual injection.');
    console.error('   Run with --help to see all options.');
    process.exit(1);
  }

  const targetService = args.service;
  const bugType       = args.bug;

  if (!SERVICE_NAMES.includes(targetService)) {
    console.error(`❌ Unknown service: "${targetService}"`);
    console.error(`   Valid services: ${SERVICE_NAMES.join(', ')}`);
    process.exit(1);
  }
  if (!BUG_TYPES.includes(bugType)) {
    console.error(`❌ Unknown bug type: "${bugType}"`);
    console.error(`   Valid types: ${BUG_TYPES.join(', ')}`);
    process.exit(1);
  }

  logChaos(`\n🎯 Manual Injection: ${targetService} | Bug: ${bugType}`);

  try {
    const injector = BUG_INJECTORS[bugType];
    const result = injector(targetService);
    const event = { ...result, injectedAt: new Date().toISOString(), restored: false };

    console.log('\n💥 CHAOS INJECTED SUCCESSFULLY!');
    console.log('━'.repeat(40));
    console.log(`   Service:     ${result.service}`);
    console.log(`   Bug Type:    ${result.bugType}`);
    console.log(`   File:        ${result.file}`);
    console.log(`   Description: ${result.description}`);
    console.log('━'.repeat(40));

    // Only kill the process for bugs that actually crash the server
    const crashesBug = bugType === 'CM-001' || bugType === 'CM-002';
    if (crashesBug) {
      const port = SERVICE_PORTS[targetService];
      console.log(`\n🔪 Killing ${targetService} process on port ${port}...`);
      killPort(port, new Set());
    } else if (bugType === 'CM-003') {
      console.log(`\nℹ️  CM-003: Service stays running — /health now returns CRITICAL status.`);
      console.log(`   The health poller will detect this on its next poll.`);
    } else if (bugType === 'CM-004') {
      console.log(`\nℹ️  CM-004: package.json corrupted — running process unaffected.`);
      console.log(`   npm install/start will fail until the Sentinel Agent restores the file.`);
    }

    // APPEND to existing .chaos-event.json so multiple manual injections stack
    const chaosEventFile = path.join(ROOT_DIR, '.chaos-event.json');
    let existingEvents = [];
    if (fs.existsSync(chaosEventFile)) {
      try { existingEvents = JSON.parse(fs.readFileSync(chaosEventFile, 'utf8')); }
      catch { existingEvents = []; }
      if (!Array.isArray(existingEvents)) existingEvents = [existingEvents];
      // Remove any previous event for the same service+file so no stale duplicates
      existingEvents = existingEvents.filter(e => e.file !== result.file);
    }
    existingEvents.push(event);
    fs.writeFileSync(chaosEventFile, JSON.stringify(existingEvents, null, 2));

    console.log('🔄 To restore manually:');
    console.log('   node scripts/chaosMonkey.js --restore\n');

  } catch (error) {
    logChaos(`❌ INJECTION FAILED: ${error.message}`);
    console.error('Chaos injection failed:', error.message);
    process.exit(1);
  }
}

main();
