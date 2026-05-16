/**
 * scripts/chaosMonkey.js
 * The Chaos Monkey — randomly introduces bugs into the microservices.
 *
 * Introduces 5 types of bugs:
 *   CM-001: Syntax Error      — corrupts a JS file with invalid syntax
 *   CM-002: Missing Dependency — removes a require() call
 *   CM-003: Logic Error       — changes a variable name or return value
 *   CM-004: JSON Corruption   — corrupts a package.json file
 *   CM-005: Port Conflict     — changes the PORT constant to conflict with another service
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
const BUG_TYPES = ['CM-001', 'CM-002', 'CM-003', 'CM-004', 'CM-005'];

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

/**
 * CM-005: Port Conflict
 * Changes the service's PORT to conflict with another running service.
 */
function injectPortConflict(serviceName) {
  const targetFile = path.join(SERVICES_DIR, serviceName, 'index.js');

  if (!fs.existsSync(targetFile)) {
    throw new Error(`Target file not found: ${targetFile}`);
  }

  backupFile(targetFile);
  let content = fs.readFileSync(targetFile, 'utf8');

  const originalPort = SERVICE_PORTS[serviceName];
  // Pick a conflicting port (another service's port)
  const conflictPort = Object.values(SERVICE_PORTS).find(p => p !== originalPort) || 3001;

  const portRegex = new RegExp(`const PORT = ${originalPort};`);
  if (!portRegex.test(content)) {
    throw new Error(`Could not find PORT = ${originalPort} in ${serviceName}`);
  }

  content = content.replace(portRegex, `const PORT = ${conflictPort}; // CM-005: PORT CONFLICT — was ${originalPort}`);
  fs.writeFileSync(targetFile, content, 'utf8');

  logChaos(`💥 CM-005 PORT CONFLICT injected into ${serviceName}/index.js — PORT changed from ${originalPort} to ${conflictPort}`);
  return { bugType: 'CM-005', service: serviceName, file: targetFile, description: `Port changed from ${originalPort} to ${conflictPort}` };
}

// =============================================================================
// Main Orchestration
// =============================================================================

const BUG_INJECTORS = {
  'CM-001': injectSyntaxError,
  'CM-002': injectMissingDependency,
  'CM-003': injectLogicError,
  'CM-004': injectJsonCorruption,
  'CM-005': injectPortConflict,
};

/**
 * Pick a random element from an array.
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Parse command-line arguments.
 * Supports: --service <name> --bug <CM-xxx> --restore
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { service: null, bug: null, restore: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--service' && args[i + 1]) result.service = args[++i];
    if (args[i] === '--bug'     && args[i + 1]) result.bug     = args[++i];
    if (args[i] === '--restore')                result.restore  = true;
  }

  return result;
}

/**
 * Restore all backed-up service files.
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
    // Reconstruct original path: services_auth-service_index.js.bak → services/auth-service/index.js
    const originalRelative = backup
      .replace(/\.bak$/, '')
      .replace(/^services_/, 'services/')
      .replace(/_index\.js$/, '/index.js')
      .replace(/_package\.json$/, '/package.json');

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
 * Inject exactly 5 random chaos bugs across services.
 * Picks 5 unique (service, bugType) pairs from the full combination grid,
 * skipping any combo that would fail (e.g. CM-005 already offset port).
 */
function injectMultiChaos() {
  // Build all possible (service, bug) combos and shuffle them
  const allCombos = [];
  for (const svc of SERVICE_NAMES) {
    for (const bug of BUG_TYPES) {
      allCombos.push({ service: svc, bug });
    }
  }
  // Fisher-Yates shuffle
  for (let i = allCombos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCombos[i], allCombos[j]] = [allCombos[j], allCombos[i]];
  }

  const results = [];
  const killedPorts = new Set();
  const { execSync } = require('child_process');

  console.log('💥 INJECTING 5 RANDOM CHAOS BUGS...\n');
  console.log('━'.repeat(55));

  for (const pick of allCombos) {
    if (results.length >= 5) break;
    try {
      logChaos(`\n🎯 [${results.length + 1}/5] Target: ${pick.service} | Bug: ${pick.bug}`);
      const injector = BUG_INJECTORS[pick.bug];
      const result = injector(pick.service);
      results.push({
        ...result,
        injectedAt: new Date().toISOString(),
        restored: false,
      });
      console.log(`  💥 [${results.length}/5] ${pick.bug} → ${pick.service}: ${result.description}`);

      // Kill the service process once per service
      const port = SERVICE_PORTS[pick.service];
      if (port && !killedPorts.has(port)) {
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
    } catch (err) {
      logChaos(`⚠️  Skipped [${pick.bug} → ${pick.service}]: ${err.message}`);
    }
  }

  console.log('\n' + '━'.repeat(55));
  console.log(`💥 CHAOS COMPLETE — ${results.length} bugs injected!`);
  console.log('━'.repeat(55));
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.bugType}] ${r.service} — ${r.description}`);
  });
  console.log('━'.repeat(55));
  console.log('\n📋 Run the Sentinel Agent to auto-fix all 5:');
  console.log('   npm run sentinel\n');
  console.log('🔄 Or restore manually:');
  console.log('   node scripts/chaosMonkey.js --restore\n');

  // Write all 5 events as an array
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

  // ── DEFAULT (no args): inject exactly 5 random bugs ──────────────────────────
  if (!args.service && !args.bug) {
    injectMultiChaos();
    return;
  }

  // ── EXPLICIT mode: --service <name> --bug <CM-xxx> ────────────────────────────
  const targetService = args.service || randomChoice(SERVICE_NAMES);
  const bugType       = args.bug     || randomChoice(BUG_TYPES);

  if (!SERVICE_NAMES.includes(targetService)) {
    console.error(`❌ Unknown service: ${targetService}`);
    console.error(`   Valid services: ${SERVICE_NAMES.join(', ')}`);
    process.exit(1);
  }
  if (!BUG_TYPES.includes(bugType)) {
    console.error(`❌ Unknown bug type: ${bugType}`);
    console.error(`   Valid types: ${BUG_TYPES.join(', ')}`);
    process.exit(1);
  }

  logChaos(`\n🎯 Target: ${targetService} | Bug: ${bugType}`);

  try {
    const injector = BUG_INJECTORS[bugType];
    const result = injector(targetService);

    console.log('\n💥 CHAOS INJECTED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Service:     ${result.service}`);
    console.log(`   Bug Type:    ${result.bugType}`);
    console.log(`   File:        ${result.file}`);
    console.log(`   Description: ${result.description}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log(`\n[CHAOS-MONKEY] 🔪 Killing process on port ${SERVICE_PORTS[result.service]}...`);
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`netstat -ano | findstr :${SERVICE_PORTS[result.service]}`).toString();
      const lines = stdout.split('\n').filter(l => l.includes('LISTENING'));
      if (lines.length > 0) {
        const pid = lines[0].trim().split(/\s+/).pop();
        if (pid && pid !== '0') {
          execSync(`taskkill /F /PID ${pid}`);
          console.log(`[CHAOS-MONKEY] ✅ Process ${pid} killed.`);
        }
      } else {
        console.log(`[CHAOS-MONKEY] ⚠️  No process found on port ${SERVICE_PORTS[result.service]}.`);
      }
    } catch (err) {
      console.log(`[CHAOS-MONKEY] ⚠️  Could not kill: ${err.message}`);
    }

    console.log('\n📋 Run the Sentinel Agent to auto-fix:');
    console.log('   npm run sentinel\n');
    console.log('🔄 To restore manually:');
    console.log('   node scripts/chaosMonkey.js --restore\n');

    // Write as single-element array — consistent with multi-bug format
    const chaosEventFile = path.join(ROOT_DIR, '.chaos-event.json');
    fs.writeFileSync(chaosEventFile, JSON.stringify([{
      ...result,
      injectedAt: new Date().toISOString(),
      restored: false,
    }], null, 2));

  } catch (error) {
    logChaos(`❌ INJECTION FAILED: ${error.message}`);
    console.error('Chaos injection failed:', error.message);
    process.exit(1);
  }
}

main();
