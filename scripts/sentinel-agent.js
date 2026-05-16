/**
 * scripts/sentinel-agent.js
 * The Sentinel Agent — autonomous incident resolution loop.
 *
 * This script demonstrates the agentic resolution workflow:
 *   1. Detects CRITICAL incidents from the SQLite database
 *   2. Reads error logs to identify the bug type
 *   3. Reads the Chaos Monkey event file to understand what was broken
 *   4. Dispatches a "Debugger" subagent to apply a fix
 *   5. Dispatches a "QA" subagent to write a regression test
 *   6. Updates the database and incident history log
 *
 * Usage: node scripts/sentinel-agent.js
 *        node scripts/sentinel-agent.js --once  (run one resolution cycle, then exit)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR     = path.join(__dirname, '..');
const SERVICES_DIR = path.join(ROOT_DIR, 'services');
const db = require(path.join(ROOT_DIR, 'database', 'db.js'));

const LOG_FILE         = path.join(ROOT_DIR, 'services', 'logs', 'error.log');
const CHAOS_LOG        = path.join(ROOT_DIR, 'services', 'logs', 'chaos.log');
const INCIDENT_HISTORY = path.join(ROOT_DIR, 'docs', 'incident-history.log');
const CHAOS_EVENT_FILE = path.join(ROOT_DIR, '.chaos-event.json');
const BACKUP_DIR       = path.join(ROOT_DIR, '.chaos-backups');

const AGENT_LOOP_INTERVAL_MS = 15000; // Check every 15 seconds

// =============================================================================
// Logging Utilities
// =============================================================================

function log(agent, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${agent}] ${message}`;
  console.log(line);
  db.logAgentAction(agent, message);
}

function logError(agent, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${agent}] ERROR: ${message}`;
  console.error(line);
  db.logAgentAction(agent, `ERROR: ${message}`);
}

// =============================================================================
// Subagent Alpha — The Debugger
// =============================================================================

/**
 * Subagent Alpha: Reads error logs and applies the appropriate fix
 * based on the chaos event type.
 *
 * In a real Claude-powered setup, this would be spawned with:
 *   claude -p "Subagent Alpha prompt..."
 *
 * Here, we simulate the debugger with deterministic fix logic.
 *
 * @param {object} incident - The incident record from the database.
 * @param {object} chaosEvent - The chaos event from .chaos-event.json.
 * @returns {object} Result of the fix attempt.
 */
function subagentAlpha_Debugger(incident, chaosEvents) {
  log('Subagent-Alpha', `Starting debug session for incident #${incident.id} — ${incident.service_name}`);
  const bugTypes = chaosEvents.map(e => e.bugType).join(' + ');
  log('Subagent-Alpha', `Bug types: ${bugTypes}`);

  // Step 1: Read the error log for context
  let recentErrors = '';
  try {
    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = logContent.split('\n').filter(Boolean);
    const relevantLines = lines.filter(l => l.includes(incident.service_name)).slice(-10);
    recentErrors = relevantLines.join('\n');
    log('Subagent-Alpha', `Found ${relevantLines.length} recent error lines for ${incident.service_name}`);
  } catch {
    log('Subagent-Alpha', 'Could not read error log — proceeding with chaos event data only');
  }

  // Step 2: Restore backups for ALL files affected by these events
  const restoredFiles = new Set();
  let failedRestores = 0;

  for (const event of chaosEvents) {
    if (restoredFiles.has(event.file)) continue; // already restored

    log('Subagent-Alpha', `Attempting fix for ${event.bugType} in ${path.basename(event.file)}...`);
    
    const relPath = path.relative(ROOT_DIR, event.file).replace(/\\/g, '_').replace(/\//g, '_');
    const backupPath = path.join(BACKUP_DIR, `${relPath}.bak`);

    if (!fs.existsSync(backupPath)) {
      logError('Subagent-Alpha', `No backup found at ${backupPath}. Cannot auto-restore.`);
      failedRestores++;
      continue;
    }

    // Restore the original file
    fs.copyFileSync(backupPath, event.file);
    fs.unlinkSync(backupPath);
    restoredFiles.add(event.file);
  }

  if (failedRestores > 0 && restoredFiles.size === 0) {
    return {
      success: false,
      fixDescription: 'No backups available for auto-restore',
      notes: `Manual intervention required`,
    };
  }

  const restoredNames = Array.from(restoredFiles).map(f => path.basename(f)).join(', ');
  const fixDescription = `Restored ${restoredNames} from backup(s) (${bugTypes})`;
  log('Subagent-Alpha', `✅ Fix applied: ${fixDescription}`);

  return {
    success: true,
    fixDescription,
    notes: `Auto-restored from chaos backup.`,
    recentErrors,
  };
}

// =============================================================================
// Subagent Beta — The QA Agent
// =============================================================================

/**
 * Subagent Beta: Writes a regression test for the fixed service.
 *
 * @param {string} serviceName - Name of the fixed service.
 * @param {string} bugType - The bug type that was fixed.
 */
function subagentBeta_QA(serviceName, bugType) {
  log('Subagent-Beta', `Writing regression test for ${serviceName} (bug: ${bugType})`);

  const testsDir = path.join(ROOT_DIR, 'services', serviceName, 'tests');
  if (!fs.existsSync(testsDir)) {
    fs.mkdirSync(testsDir, { recursive: true });
  }

  const testFilePath = path.join(testsDir, 'regression.test.js');

  const servicePort = {
    'auth-service':         3101,
    'payment-service':      3102,
    'inventory-service':    3103,
    'notification-service': 3104,
  }[serviceName] || 3101;

  const testContent = `/**
 * Regression test for ${serviceName}
 * Generated by Subagent Beta (QA Agent) at ${new Date().toISOString()}
 * Fixed Bug: ${bugType} — ${serviceName}
 *
 * This test ensures the service remains healthy after the Chaos Monkey fix.
 * Run: node services/${serviceName}/tests/regression.test.js
 */

'use strict';

const http = require('http');

const SERVICE_NAME = '${serviceName}';
const PORT = ${servicePort};
let passed = 0;
let failed = 0;

function httpGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port, path: urlPath, method: 'GET', timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function assert(testName, fn) {
  try {
    await fn();
    console.log(\`  ✅ PASS: \${testName}\`);
    passed++;
  } catch (err) {
    console.error(\`  ❌ FAIL: \${testName} — \${err.message}\`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(\`\${label}: expected "\${expected}", got "\${actual}"\`);
  }
}

function assertExists(value, label) {
  if (value === undefined || value === null) {
    throw new Error(\`\${label}: expected a value, got \${value}\`);
  }
}

async function runTests() {
  console.log(\`\\n🧪 Regression Tests: \${SERVICE_NAME}\`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Test 1: Health endpoint returns 200
  await assert('GET /health returns HTTP 200', async () => {
    const res = await httpGet(PORT, '/health');
    assertEqual(res.status, 200, 'HTTP status');
  });

  // Test 2: Health response has HEALTHY status
  await assert('GET /health returns HEALTHY status', async () => {
    const res = await httpGet(PORT, '/health');
    assertEqual(res.body.status, 'HEALTHY', 'status field');
  });

  // Test 3: Health response includes service name
  await assert('GET /health includes service name', async () => {
    const res = await httpGet(PORT, '/health');
    assertEqual(res.body.service, SERVICE_NAME, 'service field');
  });

  // Test 4: Health response includes port
  await assert('GET /health includes correct port', async () => {
    const res = await httpGet(PORT, '/health');
    assertEqual(res.body.port, PORT, 'port field');
  });

  // Test 5: Work endpoint returns 200
  await assert('GET /work returns HTTP 200', async () => {
    const res = await httpGet(PORT, '/work');
    assertEqual(res.status, 200, 'HTTP status');
  });

  // Test 6: Work endpoint returns success
  await assert('GET /work returns success: true', async () => {
    const res = await httpGet(PORT, '/work');
    assertEqual(res.body.success, true, 'success field');
  });

  // Test 7: Bug-type-specific regression check
  // Bug: ${bugType} — ${serviceName}
  await assert('Regression: Service not affected by ${bugType}', async () => {
    const res = await httpGet(PORT, '/health');
    // Ensure the status is not CRITICAL (would indicate CM-003 logic error)
    if (res.body.status === 'CRITICAL') {
      throw new Error('Status is CRITICAL — CM-003 logic error may still be present');
    }
    // Ensure we got a valid response (not a parse error — would indicate CM-001)
    assertExists(res.body.status, 'status');
  });

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(\`Results: \${passed} passed, \${failed} failed\`);

  if (failed > 0) {
    console.error(\`\\n❌ REGRESSION DETECTED in \${SERVICE_NAME}!\`);
    process.exit(1);
  } else {
    console.log(\`\\n✅ All regression tests passed for \${SERVICE_NAME}\`);
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err.message);
  console.error('Make sure the service is running on port ' + PORT);
  process.exit(1);
});
`;

  fs.writeFileSync(testFilePath, testContent, 'utf8');
  log('Subagent-Beta', `✅ Regression test written: ${testFilePath}`);

  return { testFilePath, testsWritten: 7 };
}

// =============================================================================
// Main Agent — Orchestrator
// =============================================================================

/**
 * Read all pending (unresolved) chaos events.
 * Handles both old single-object format and new array format.
 * @returns {Array} Unresolved chaos events.
 */
function readChaosEvents() {
  if (!fs.existsSync(CHAOS_EVENT_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(CHAOS_EVENT_FILE, 'utf8'));
    const all = Array.isArray(raw) ? raw : [raw];
    return all.filter(e => !e.restored);
  } catch {
    return [];
  }
}

/**
 * Mark all chaos events for a specific service as resolved and save the file.
 * @param {string} serviceName
 */
function markChaosEventsResolvedForService(serviceName) {
  if (!fs.existsSync(CHAOS_EVENT_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(CHAOS_EVENT_FILE, 'utf8'));
    const all = Array.isArray(raw) ? raw : [raw];
    const updated = all.map(e =>
      e.service === serviceName
        ? { ...e, restored: true, resolvedAt: new Date().toISOString() }
        : e
    );
    fs.writeFileSync(CHAOS_EVENT_FILE, JSON.stringify(updated, null, 2));
  } catch { /* ignore */ }
}

/**
 * Main resolution loop.
 * Groups incidents by service, applies one backup-restore per service
 * (which fixes ALL stacked bugs at once), then restarts the service.
 */
async function resolutionCycle() {
  await db.init(true);
  log('Main-Agent', '🔍 Scanning for CRITICAL incidents...');

  // Step 1: Collect all OPEN + stuck INVESTIGATING CRITICAL incidents
  const openIncidents = [
    ...db.getIncidents('OPEN').filter(i => i.severity === 'CRITICAL'),
    ...db.getIncidents('INVESTIGATING').filter(i => i.severity === 'CRITICAL'),
  ];

  if (openIncidents.length === 0) {
    log('Main-Agent', '✅ No CRITICAL incidents detected. System is healthy.');
    return;
  }

  log('Main-Agent', `⚠️  Found ${openIncidents.length} CRITICAL incident(s). Initiating resolution...`);

  // Step 2: Load all unresolved chaos events (array format)
  let chaosEvents = readChaosEvents();

  // If all events are marked resolved but services are still CRITICAL, re-activate them
  if (chaosEvents.length === 0 && fs.existsSync(CHAOS_EVENT_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CHAOS_EVENT_FILE, 'utf8'));
      const all = Array.isArray(raw) ? raw : [raw];
      const criticalServices = new Set(openIncidents.map(i => i.service_name));
      chaosEvents = all
        .filter(e => criticalServices.has(e.service))
        .map(e => ({ ...e, restored: false }));
      if (chaosEvents.length > 0) {
        log('Main-Agent', `⚠️  Re-activating ${chaosEvents.length} chaos event(s) for still-CRITICAL services.`);
      }
    } catch { /* ignore */ }
  }

  // Step 3: Group incidents by service_name to process each service exactly once
  const byService = {};
  for (const inc of openIncidents) {
    if (!byService[inc.service_name]) byService[inc.service_name] = [];
    byService[inc.service_name].push(inc);
  }

  for (const [serviceName, incidents] of Object.entries(byService)) {
    log('Main-Agent', `\n📋 Processing ${incidents.length} incident(s) for ${serviceName}`);

    // Mark all as INVESTIGATING
    for (const inc of incidents) {
      db.updateIncidentStatus(inc.id, 'INVESTIGATING');
      db.logAgentAction('Main-Agent', `Marked incident #${inc.id} as INVESTIGATING`, serviceName);
    }

    // Find all chaos events for this service
    const serviceEvents = chaosEvents.filter(e => e.service === serviceName);
    if (serviceEvents.length === 0) {
      log('Main-Agent', `No chaos event found for ${serviceName}. Escalating all incidents.`);
      for (const inc of incidents) db.updateIncidentStatus(inc.id, 'ESCALATED');
      continue;
    }

    const bugTypes = serviceEvents.map(e => e.bugType).join(' + ');
    log('Main-Agent', `Bug(s) to fix: ${bugTypes}`);

    // Step 4: Subagent Alpha — restore the backup (fixes ALL stacked bugs at once)
    log('Main-Agent', '🚀 Spawning Subagent Alpha (Debugger)...');
    const fixResult = subagentAlpha_Debugger(incidents[0], serviceEvents);

    if (!fixResult.success) {
      logError('Main-Agent', `Debugger failed: ${fixResult.fixDescription}`);
      for (const inc of incidents) {
        db.recordResolution(inc.id, fixResult.fixDescription, false, fixResult.notes);
        db.updateIncidentStatus(inc.id, 'ESCALATED');
      }
      continue;
    }

    // Step 5: Record a resolution for every incident of this service
    for (const inc of incidents) {
      const resId = db.recordResolution(inc.id, fixResult.fixDescription, true, fixResult.notes);
      log('Main-Agent', `📝 Resolution #${resId} recorded for incident #${inc.id}`);
    }

    // Step 6: Subagent Beta — write regression test
    log('Main-Agent', '🚀 Spawning Subagent Beta (QA Agent)...');
    const qaResult = subagentBeta_QA(serviceName, bugTypes);
    log('Main-Agent', `📝 ${qaResult.testsWritten} regression tests written at ${qaResult.testFilePath}`);

    // Step 7: Restart the fixed service
    log('Main-Agent', `🔄 Restarting ${serviceName}...`);
    try {
      const servicePath = path.join(SERVICES_DIR, serviceName);
      require('child_process').spawn('node', ['index.js'], {
        cwd: servicePath,
        detached: true,
        stdio: 'ignore',
      }).unref();
      log('Main-Agent', `✅ Restart signal sent to ${serviceName}`);
    } catch (err) {
      log('Main-Agent', `⚠️  Failed to restart: ${err.message}`);
    }

    // Step 8: Mark all chaos events for this service as resolved
    markChaosEventsResolvedForService(serviceName);

    // Step 9: Append to incident history
    const historyEntry = `[${new Date().toISOString()}] Service: ${serviceName} | Bugs: ${bugTypes} | Fix: ${fixResult.fixDescription} | Status: INVESTIGATING→will auto-RESOLVE\n`;
    fs.appendFileSync(INCIDENT_HISTORY, historyEntry);

    // Summary banner
    console.log('\n' + '═'.repeat(60));
    console.log('  🎉 SENTINEL AGENT — FIX APPLIED');
    console.log('═'.repeat(60));
    console.log(`  Service:   ${serviceName}`);
    console.log(`  Bug(s):    ${bugTypes}`);
    console.log(`  Fix:       ${fixResult.fixDescription}`);
    console.log(`  Incidents: ${incidents.map(i => `#${i.id}`).join(', ')}`);
    console.log(`  Agents:    Main + Alpha (Debugger) + Beta (QA)`);
    console.log('  Status:    INVESTIGATING → RESOLVED on next health check');
    console.log('═'.repeat(60) + '\n');
  }
}

/**
 * Entry point.
 */
async function main() {
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once');

  console.log('\n🤖 ==========================================');
  console.log('🤖  SENTINEL AGENT — Autonomous Resolution');
  console.log('🤖 ==========================================\n');

  // Initialize database
  await db.init();

  log('Main-Agent', '🚀 Sentinel Agent started.');

  if (runOnce) {
    await resolutionCycle();
    process.exit(0);
  } else {
    // Run immediately, then on interval
    await resolutionCycle();
    setInterval(resolutionCycle, AGENT_LOOP_INTERVAL_MS);
    log('Main-Agent', `🔄 Continuous mode: checking every ${AGENT_LOOP_INTERVAL_MS / 1000}s`);
  }
}

main().catch(err => {
  console.error('[Sentinel Agent] Fatal error:', err);
  process.exit(1);
});
