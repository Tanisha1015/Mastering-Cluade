/**
 * services/auth-service/index.js
 * Authentication microservice — simulates JWT validation, user login, and token refresh.
 * Exposes GET /health and GET /work endpoints.
 *
 * SENTINEL_META: service=auth-service port=3001 version=1.0.0
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const SERVICE_NAME = 'auth-service';
const PORT   = process.env.PORT || 3101;
const START_TIME = Date.now();

// Log file path (shared across all services)
const LOG_FILE = path.join(__dirname, '..', 'logs', 'error.log');

// Ensure log directory exists
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

/**
 * Write an error to the shared log file.
 * @param {string} message - Error message to log.
 */
function logError(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${SERVICE_NAME}] ERROR: ${message}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  console.error(logEntry.trim());
}

/**
 * Simulate JWT validation work.
 * Returns a mock user session if validation passes.
 */
function validateToken(token) {
  // Simulate token validation logic
  const validTokenPrefix = 'Bearer sentinel_';
  if (!token || !token.startsWith(validTokenPrefix)) {
    throw new Error('Invalid or missing token');
  }
  const userId = token.replace(validTokenPrefix, '');
  return {
    userId,
    role: 'admin',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
}

/**
 * Simulate user database lookup.
 */
function lookupUser(userId) {
  // Mock user database
  const USERS = {
    'usr_001': { name: 'Alice Chen', email: 'alice@sentinel.dev', permissions: ['read', 'write'] },
    'usr_002': { name: 'Bob Kumar', email: 'bob@sentinel.dev', permissions: ['read'] },
    'usr_003': { name: 'Clara Smith', email: 'clara@sentinel.dev', permissions: ['read', 'write', 'admin'] },
  };
  return USERS[userId] || null;
}

// GET /health — Health check endpoint (required by Sentinel monitoring)
app.get('/health', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
  res.json({
    status: 'HEALTHY',
    service: SERVICE_NAME,
    port: PORT,
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// GET /work — Simulate authentication work
app.get('/work', (req, res) => {
  try {
    // Simulate a token validation request
    const mockToken = 'Bearer sentinel_usr_001';
    const session = validateToken(mockToken);
    const user = lookupUser(session.userId);

    if (!user) {
      logError(`User not found for token: ${mockToken}`);
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    res.json({
      success: true,
      service: SERVICE_NAME,
      result: {
        authenticated: true,
        user: user,
        session: session,
        processingTimeMs: Math.floor(Math.random() * 50) + 10,
      },
    });
  } catch (error) {
    logError(`Work execution failed: ${error.message}`);
    res.status(500).json({ error: error.message, service: SERVICE_NAME });
  }
});

// GET /metrics — Basic service metrics
app.get('/metrics', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
  res.json({
    service: SERVICE_NAME,
    uptime: uptimeSeconds,
    memory: process.memoryUsage(),
    pid: process.pid,
    timestamp: new Date().toISOString(),
  });
});

// Start the service
app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] Running on port ${PORT}`);
  console.log(`[${SERVICE_NAME}] Health: http://localhost:${PORT}/health`);
});

// Handle uncaught exceptions — log and report before exiting
process.on('uncaughtException', (error) => {
  logError(`UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError(`UNHANDLED REJECTION: ${reason}`);
});

module.exports = app;
