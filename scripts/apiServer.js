/**
 * scripts/apiServer.js
 * Standalone Express API server for the Sentinel dashboard.
 * Runs on port 3099 — completely separate from Next.js so sql.js
 * (which needs WASM) works without any webpack bundling issues.
 *
 * Usage: node scripts/apiServer.js
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = 3099;

const db = require(path.join(__dirname, '..', 'database', 'db.js'));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

// ── Initialize DB on startup ─────────────────────────────────────────────────
async function startServer() {
  await db.init();
  console.log('[API-SERVER] Database ready.');

  // ── GET /api/services ───────────────────────────────────────────────────────
  app.get('/api/services', (req, res) => {
    try {
      const services = db.getAllServices();
      const summary  = db.getSystemSummary();
      res.json({ services, summary, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[API-SERVER] /api/services error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/incidents ──────────────────────────────────────────────────────
  app.get('/api/incidents', (req, res) => {
    try {
      const open          = db.getIncidents('OPEN');
      const investigating = db.getIncidents('INVESTIGATING');
      const resolved      = db.getIncidents('RESOLVED');
      const resolutions   = db.getResolutions(20);
      const agentLogs     = db.getAgentLogs(30);

      res.json({
        open,
        investigating,
        resolved,
        resolutions,
        agentLogs,
        counts: {
          open:          open.length,
          investigating: investigating.length,
          resolved:      resolved.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[API-SERVER] /api/incidents error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/resolve ───────────────────────────────────────────────────────
  app.post('/api/resolve', (req, res) => {
    try {
      const { incidentId } = req.body;
      if (!incidentId) {
        return res.status(400).json({ error: 'incidentId is required' });
      }
      db.updateIncidentStatus(incidentId, 'INVESTIGATING');
      db.logAgentAction(
        'Dashboard-Trigger',
        `Manual resolution triggered for incident #${incidentId}`,
        `Triggered via dashboard at ${new Date().toISOString()}`
      );
      res.json({
        success:   true,
        message:   `Incident #${incidentId} marked as INVESTIGATING`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[API-SERVER] /api/resolve error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Health check for the API server itself ──────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({ status: 'HEALTHY', service: 'api-server', port: PORT });
  });

  app.listen(PORT, () => {
    console.log(`[API-SERVER] 🚀 Sentinel API server running on http://localhost:${PORT}`);
    console.log(`[API-SERVER]    GET  http://localhost:${PORT}/api/services`);
    console.log(`[API-SERVER]    GET  http://localhost:${PORT}/api/incidents`);
    console.log(`[API-SERVER]    POST http://localhost:${PORT}/api/resolve`);
  });
}

startServer().catch(err => {
  console.error('[API-SERVER] Failed to start:', err.message);
  process.exit(1);
});
