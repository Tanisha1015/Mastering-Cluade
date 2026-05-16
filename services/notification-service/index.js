/**
 * services/notification-service/index.js
 * Notification microservice — simulates email and SMS dispatch,
 * delivery tracking, and template rendering.
 *
 * SENTINEL_META: service=notification-service port=3004 version=1.0.0
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const SERVICE_NAME = 'notification-service';
const PORT = process.env.PORT || 3104;
const START_TIME = Date.now();

const LOG_FILE = path.join(__dirname, '..', 'logs', 'error.log');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

/**
 * Write an error to the shared log file.
 */
function logError(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${SERVICE_NAME}] ERROR: ${message}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  console.error(logEntry.trim());
}

// Mock notification templates
const TEMPLATES = {
  ORDER_CONFIRMED: {
    subject: 'Your order has been confirmed!',
    body: 'Hi {{name}}, your order #{{orderId}} has been confirmed and is being processed.',
    channels: ['email', 'sms'],
  },
  PAYMENT_SUCCESS: {
    subject: 'Payment received successfully',
    body: 'Hi {{name}}, we have received your payment of {{amount}} {{currency}}.',
    channels: ['email'],
  },
  SHIPMENT_UPDATE: {
    subject: 'Your order is on the way!',
    body: 'Hi {{name}}, your order #{{orderId}} has been shipped. Track: {{trackingId}}',
    channels: ['email', 'sms'],
  },
  SYSTEM_ALERT: {
    subject: '[SENTINEL] System Alert',
    body: 'Service {{service}} is reporting status: {{status}}. Action required.',
    channels: ['email'],
  },
};

/**
 * Render a notification template with provided variables.
 * @param {string} templateId - Template identifier.
 * @param {object} variables - Key-value pairs to substitute into the template.
 */
function renderTemplate(templateId, variables = {}) {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown notification template: ${templateId}`);
  }

  let subject = template.subject;
  let body = template.body;

  // Substitute variables
  Object.entries(variables).forEach(([key, value]) => {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(pattern, value);
    body = body.replace(pattern, value);
  });

  return { subject, body, channels: template.channels };
}

/**
 * Simulate dispatching a notification via a channel.
 * @param {string} channel - 'email' or 'sms'.
 * @param {string} recipient - Recipient address/number.
 * @param {object} content - Rendered notification content.
 */
function dispatchNotification(channel, recipient, content) {
  const DISPATCH_SUCCESS_RATE = 0.95; // 95% success rate simulation

  if (Math.random() > DISPATCH_SUCCESS_RATE) {
    throw new Error(`Dispatch failed for ${channel} to ${recipient} — gateway timeout`);
  }

  return {
    dispatched: true,
    channel,
    recipient,
    messageId: `MSG_${channel.toUpperCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    deliveredAt: new Date().toISOString(),
  };
}

// GET /health
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

// GET /work — Simulate sending a notification
app.get('/work', (req, res) => {
  try {
    const templateIds = Object.keys(TEMPLATES);
    const randomTemplate = templateIds[Math.floor(Math.random() * templateIds.length)];

    const rendered = renderTemplate(randomTemplate, {
      name: 'Alice Chen',
      orderId: `ORD_${Date.now()}`,
      amount: '₹4,999',
      currency: 'INR',
      trackingId: `TRK_${Math.random().toString(36).substr(2, 10).toUpperCase()}`,
      service: 'auth-service',
      status: 'HEALTHY',
    });

    const dispatchResults = rendered.channels.map(channel =>
      dispatchNotification(channel, channel === 'email' ? 'alice@sentinel.dev' : '+91-9876543210', rendered)
    );

    res.json({
      success: true,
      service: SERVICE_NAME,
      result: {
        template: randomTemplate,
        rendered,
        dispatches: dispatchResults,
        processingTimeMs: Math.floor(Math.random() * 150) + 30,
      },
    });
  } catch (error) {
    logError(`Notification dispatch failed: ${error.message}`);
    res.status(500).json({ error: error.message, service: SERVICE_NAME });
  }
});

// GET /metrics
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

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] Running on port ${PORT}`);
  console.log(`[${SERVICE_NAME}] Health: http://localhost:${PORT}/health`);
});

process.on('uncaughtException', (error) => {
  logError(`UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError(`UNHANDLED REJECTION: ${reason}`);
});

module.exports = app;
