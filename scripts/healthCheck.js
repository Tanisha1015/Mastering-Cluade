/**
 * scripts/healthCheck.js
 * Health check poller — polls all 4 microservices every 10 seconds,
 * writes status to SQLite, creates incidents for failing services,
 * and appends errors to the shared log file.
 *
 * Usage: node scripts/healthCheck.js
 */

'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

// Add the root to the require path to resolve the database module
const rootDir = path.join(__dirname, '..');
const db = require(path.join(rootDir, 'database', 'db.js'));

const LOG_FILE = path.join(rootDir, 'services', 'logs', 'error.log');
const INCIDENT_HISTORY = path.join(rootDir, 'docs', 'incident-history.log');

const POLL_INTERVAL_MS = 3000; // 3 seconds — near-real-time without disk thrash

// Service registry — must match the services seeded in db.js
const SERVICES = [
  { name: 'auth-service',         port: 3101 },
  { name: 'payment-service',      port: 3102 },
  { name: 'inventory-service',    port: 3103 },
  { name: 'notification-service', port: 3104 }
];

/**
 * Ensure necessary directories and files exist.
 */
function ensureFiles() {
  const logsDir = path.join(rootDir, 'services', 'logs');
  const docsDir = path.join(rootDir, 'docs');

  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  if (!fs.existsSync(docsDir))  fs.mkdirSync(docsDir,  { recursive: true });

  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
  if (!fs.existsSync(INCIDENT_HISTORY)) {
    fs.writeFileSync(INCIDENT_HISTORY, '# Project Sentinel — Incident History Log\n\n');
  }
}

/**
 * Write to the shared error log.
 */
function logError(service, message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [HEALTH-CHECK] [${service}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  console.error(entry.trim());
}

/**
 * Write to the incident history document.
 */
function logIncidentHistory(serviceName, errorType, description, status) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] Service: ${serviceName} | Error: ${errorType} | Description: ${description} | Status: ${status}\n`;
  fs.appendFileSync(INCIDENT_HISTORY, entry);
}

/**
 * Make an HTTP GET request and return the parsed JSON response.
 * Rejects on network error, non-200 status, or timeout.
 * @param {string} hostname
 * @param {number} port
 * @param {string} path
 * @param {number} timeoutMs
 * @returns {Promise<{statusCode: number, body: object}>}
 */
function httpGet(hostname, port, urlPath, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path: urlPath,
      method: 'GET',
      timeout: timeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body });
        } catch {
          resolve({ statusCode: res.statusCode, body: { raw: data } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });

    req.end();
  });
}

/**
 * Determine the Chaos Monkey bug type from an error message.
 * @param {string} errorMessage
 * @returns {string} Chaos Monkey error code.
 */
function classifyError(errorMessage) {
  const msg = (errorMessage || '').toLowerCase();
  if (msg.includes('syntaxerror') || msg.includes('parse error') || msg.includes('unexpected token')) {
    return 'CM-001'; // Syntax Error
  }
  if (msg.includes('cannot find module') || msg.includes('module not found')) {
    return 'CM-002'; // Missing Dependency
  }
  if (msg.includes('500') || msg.includes('internal server error')) {
    return 'CM-003'; // Logic Error
  }
  if (msg.includes('json') || msg.includes('package.json')) {
    return 'CM-004'; // JSON Corruption
  }
  if (msg.includes('eaddrinuse') || msg.includes('port') || msg.includes('already in use')) {
    return 'CM-005'; // Port Conflict
  }
  return 'UNKNOWN';
}

/**
 * Poll a single service's /health endpoint.
 * @param {{name: string, port: number}} service
 */
async function pollService(service) {
  const { name, port } = service;

  try {
    const { statusCode, body } = await httpGet('localhost', port, '/health');

    if (statusCode === 200 && body.status === 'HEALTHY') {
      // Service is healthy
      db.updateServiceStatus(name, 'HEALTHY', null, body.uptime || 0);
      console.log(`[POLLER] ✅ ${name} — HEALTHY (uptime: ${body.uptime}s)`);

      // Resolve any open incidents for this service
      const openIncidents = db.getIncidents('OPEN').filter(i => i.service_name === name);
      const investigatingIncidents = db.getIncidents('INVESTIGATING').filter(i => i.service_name === name);
      const allActiveIncidents = [...openIncidents, ...investigatingIncidents];

      for (const incident of allActiveIncidents) {
        db.updateIncidentStatus(incident.id, 'RESOLVED');

        // Only auto-record a resolution if the Sentinel Agent hasn't already done so
        const existingResolutions = db.getResolutions(50).filter(
          r => Number(r.incident_id) === Number(incident.id) && Number(r.success) === 1
        );
        if (existingResolutions.length === 0) {
          db.recordResolution(
            incident.id,
            'Service recovered — health check passed',
            true,
            'Auto-resolved: service returned HEALTHY status'
          );
        }

        logIncidentHistory(name, incident.error_type, 'Service recovered', 'RESOLVED');
        db.logAgentAction('Health Poller', `Auto-resolved incident #${incident.id} for ${name}`, 'Service returned HEALTHY');
        console.log(`[POLLER] 🔧 Auto-resolved incident #${incident.id} for ${name}`);
      }
    } else {
      // Service returned non-HEALTHY status
      const errorMsg = body.error || `Service returned status ${body.status || statusCode}`;
      db.updateServiceStatus(name, 'WARNING', errorMsg);
      console.warn(`[POLLER] ⚠️  ${name} — WARNING: ${errorMsg}`);
    }
  } catch (error) {
    // Service is unreachable or crashed
    const errorMessage = error.message;
    const errorType = classifyError(errorMessage);

    db.updateServiceStatus(name, 'CRITICAL', errorMessage);
    logError(name, `CRITICAL — ${errorMessage} (Type: ${errorType})`);

    // Create incident if one doesn't already exist
    const incidentId = db.createIncident(
      name,
      errorType,
      `Service unreachable: ${errorMessage}`,
      'CRITICAL'
    );

    logIncidentHistory(name, errorType, `Service unreachable: ${errorMessage}`, 'OPEN');
    db.logAgentAction('Health Poller', `Created incident #${incidentId} for ${name}`, errorMessage);

    console.error(`[POLLER] 🚨 ${name} — CRITICAL! Incident #${incidentId} created. Error: ${errorMessage}`);
  }
}

/**
 * Poll all services in parallel.
 */
async function pollAllServices() {
  console.log(`\n[POLLER] === Health Check @ ${new Date().toISOString()} ===`);
  await Promise.allSettled(SERVICES.map(pollService));
}

/**
 * Main poller loop.
 */
async function main() {
  console.log('[POLLER] 🚀 Sentinel Health Check Poller starting...');
  
  // Wait 10 seconds for services to boot up before first poll
  console.log('[POLLER] Waiting 10s for services to initialize...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('[POLLER] Services:', SERVICES.map(s => `${s.name}:${s.port}`).join(', '));

  ensureFiles();

  // Initialize database first
  await db.init();
  console.log('[POLLER] Database ready.');

  // Run immediately on start
  await pollAllServices();

  // Then poll on an interval
  setInterval(pollAllServices, POLL_INTERVAL_MS);
}

main().catch(err => {
  console.error('[POLLER] Fatal error:', err);
  process.exit(1);
});
