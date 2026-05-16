/**
 * database/db.js
 * SQLite database module for Project Sentinel.
 * Uses sql.js (pure JavaScript, no native compilation required).
 *
 * Usage pattern:
 *   const db = require('./database/db');
 *   await db.init();         // call once at startup
 *   db.getAllServices();     // synchronous after init
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'sentinel.db');

let _SQL = null;   // sql.js library
let _db  = null;   // open Database instance
let _ready = false;

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Initialize the database (must be awaited at startup).
 * @param {boolean} force - If true, re-reads the file from disk even if already loaded.
 */
async function init(force = false) {
  if (_ready && !force) return;

  if (!_SQL) {
    const initSqlJs = require('sql.js');
    _SQL = await initSqlJs();
  }

  if (fs.existsSync(DB_PATH)) {
    // If closing an old DB instance
    if (_db) {
      try { _db.close(); } catch (e) {}
    }
    _db = new _SQL.Database(fs.readFileSync(DB_PATH));
  } else if (!_db) {
    _db = new _SQL.Database();
  }

  if (!force) {
    _runSchema();
    _save();
  }
  
  _ready = true;
  // console.log(`[DB] Database initialized at: ${DB_PATH}`);
}

/**
 * Synchronous init for scripts that already called init() at top-level.
 * Do NOT call this before the promise resolves.
 */
function getDb() {
  if (!_ready) {
    throw new Error('[DB] Database not initialized. Call await db.init() first.');
  }
  return _db;
}

/** Persist the in-memory database to disk. */
function _save() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Schema ─────────────────────────────────────────────────────────────────

function _runSchema() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL UNIQUE,
      status        TEXT    NOT NULL DEFAULT 'UNKNOWN',
      port          INTEGER NOT NULL,
      last_checked  TEXT,
      error_message TEXT,
      uptime_seconds INTEGER DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      error_type   TEXT NOT NULL DEFAULT 'UNKNOWN',
      description  TEXT NOT NULL,
      detected_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      status       TEXT NOT NULL DEFAULT 'OPEN',
      severity     TEXT NOT NULL DEFAULT 'CRITICAL'
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS resolutions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id     INTEGER NOT NULL,
      fix_description TEXT    NOT NULL,
      applied_by      TEXT    NOT NULL DEFAULT 'Sentinel Agent',
      applied_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      success         INTEGER NOT NULL DEFAULT 0,
      notes           TEXT
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS agent_logs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      agent     TEXT NOT NULL,
      action    TEXT NOT NULL,
      details   TEXT,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    )
  `);

  // Seed initial services if table is empty
  const result = _db.exec("SELECT COUNT(*) AS c FROM services");
  const count  = result.length > 0 ? result[0].values[0][0] : 0;
  if (count === 0) {
    const insert = _db.prepare("INSERT INTO services (name, status, port) VALUES (?, 'UNKNOWN', ?)");
    insert.run(['auth-service',         3101]);
    insert.run(['payment-service',      3102]);
    insert.run(['inventory-service',    3103]);
    insert.run(['notification-service', 3104]);
    insert.free();
    console.log('[DB] Seeded 4 services into registry.');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Synchronously reload the DB from disk to prevent multi-process state overwrite */
function _reloadSync() {
  if (_SQL && fs.existsSync(DB_PATH)) {
    if (_db) { try { _db.close(); } catch (e) {} }
    _db = new _SQL.Database(fs.readFileSync(DB_PATH));
  }
}

/**
 * Execute a SELECT and return all rows as plain objects.
 */
function _selectAll(sql, params) {
  _reloadSync();
  const stmt = _db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/**
 * Execute a SELECT and return the first row, or null.
 */
function _selectOne(sql, params) {
  const rows = _selectAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute a mutating statement (INSERT/UPDATE/DELETE).
 * Returns the last insert rowid (or null).
 */
function _run(sql, params) {
  _reloadSync();
  _db.run(sql, params || []);
  
  const stmt = _db.prepare('SELECT last_insert_rowid() AS id');
  let id = null;
  if (stmt.step()) id = stmt.getAsObject().id;
  stmt.free();
  
  _save();
  return id;
}

// ─── Service Operations ───────────────────────────────────────────────────────

function updateServiceStatus(name, status, errorMessage, uptimeSeconds) {
  const now = new Date().toISOString();
  _run(
    'UPDATE services SET status=?, last_checked=?, error_message=?, uptime_seconds=? WHERE name=?',
    [status, now, errorMessage || null, uptimeSeconds || 0, name]
  );
}

function getAllServices() {
  return _selectAll('SELECT * FROM services ORDER BY name');
}

function getService(name) {
  return _selectOne('SELECT * FROM services WHERE name=?', [name]);
}

// ─── Incident Operations ──────────────────────────────────────────────────────

function createIncident(serviceName, errorType, description, severity) {
  // Avoid duplicate open incidents for the same service
  const existing = _selectOne(
    "SELECT id FROM incidents WHERE service_name=? AND status IN ('OPEN','INVESTIGATING') ORDER BY detected_at DESC LIMIT 1",
    [serviceName]
  );
  if (existing) return existing.id;

  return _run(
    'INSERT INTO incidents (service_name, error_type, description, severity) VALUES (?,?,?,?)',
    [serviceName, errorType || 'UNKNOWN', description, severity || 'CRITICAL']
  );
}

function getIncidents(status) {
  if (status) {
    return _selectAll(
      'SELECT i.*, s.port FROM incidents i LEFT JOIN services s ON i.service_name=s.name WHERE i.status=? ORDER BY i.detected_at DESC LIMIT 50',
      [status]
    );
  }
  return _selectAll(
    'SELECT i.*, s.port FROM incidents i LEFT JOIN services s ON i.service_name=s.name ORDER BY i.detected_at DESC LIMIT 50'
  );
}

function updateIncidentStatus(incidentId, status) {
  _run('UPDATE incidents SET status=? WHERE id=?', [status, incidentId]);
}

// ─── Resolution Operations ────────────────────────────────────────────────────

function recordResolution(incidentId, fixDescription, success, notes, appliedBy) {
  return _run(
    'INSERT INTO resolutions (incident_id, fix_description, applied_by, success, notes) VALUES (?,?,?,?,?)',
    [incidentId, fixDescription, appliedBy || 'Sentinel Agent', success ? 1 : 0, notes || null]
  );
}

function getResolutions(limit) {
  return _selectAll(
    `SELECT r.*, i.service_name, i.error_type, i.description AS incident_description
     FROM resolutions r JOIN incidents i ON r.incident_id=i.id
     ORDER BY r.applied_at DESC LIMIT ?`,
    [limit || 20]
  );
}

// ─── Agent Log Operations ─────────────────────────────────────────────────────

function logAgentAction(agent, action, details) {
  _run('INSERT INTO agent_logs (agent, action, details) VALUES (?,?,?)', [agent, action, details || null]);
}

function getAgentLogs(limit) {
  return _selectAll('SELECT * FROM agent_logs ORDER BY timestamp DESC LIMIT ?', [limit || 30]);
}

// ─── Dashboard Summary ────────────────────────────────────────────────────────

function getSystemSummary() {
  const services        = getAllServices();
  const openRow         = _selectOne("SELECT COUNT(*) AS count FROM incidents WHERE status IN ('OPEN','INVESTIGATING')");
  const resolvedTodayRow = _selectOne("SELECT COUNT(*) AS count FROM incidents WHERE status='RESOLVED' AND date(detected_at)=date('now')");
  const criticalRow     = _selectOne("SELECT COUNT(*) AS count FROM services WHERE status='CRITICAL'");
  const healthyRow      = _selectOne("SELECT COUNT(*) AS count FROM services WHERE status='HEALTHY'");

  const criticalCount = criticalRow  ? Number(criticalRow.count)      : 0;
  const healthyCount  = healthyRow   ? Number(healthyRow.count)       : 0;

  return {
    services,
    openIncidentsCount:    openRow         ? Number(openRow.count)        : 0,
    resolvedTodayCount:    resolvedTodayRow ? Number(resolvedTodayRow.count) : 0,
    criticalServicesCount: criticalCount,
    healthyServicesCount:  healthyCount,
    overallHealth:
      criticalCount === 0
        ? (services.some(s => s.status === 'WARNING') ? 'DEGRADED' : 'HEALTHY')
        : 'CRITICAL',
  };
}

/** Gracefully close the database. */
function close() {
  if (_db) {
    _db.close();
    _db = null;
    _ready = false;
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  init,
  close,
  getDb,
  initializeDatabase: init,
  updateServiceStatus,
  getAllServices,
  getService,
  createIncident,
  getIncidents,
  updateIncidentStatus,
  recordResolution,
  getResolutions,
  logAgentAction,
  getAgentLogs,
  getSystemSummary,
};

// Run initialization if called directly
if (require.main === module) {
  init().then(() => {
    console.log('[DB] Schema initialized successfully.');
    close(); // Close before exit to avoid Node 24 assertions
  }).catch(err => {
    console.error('[DB] Init failed:', err.message);
    process.exit(1);
  });
}
