/**
 * services/payment-service/index.js
 * Payment processing microservice — simulates payment gateway interactions,
 * transaction validation, and refund processing.
 *
 * SENTINEL_META: service=payment-service port=3002 version=1.0.0
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const SERVICE_NAME = 'payment-service';
const PORT = process.env.PORT || 3102;
const START_TIME = Date.now();

// Shared error log
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

/**
 * Simulate payment processing logic.
 * Returns a transaction result object.
 * @param {number} amount - Amount in cents.
 * @param {string} currency - ISO currency code.
 */
function processPayment(amount, currency = 'USD') {
  // Validate inputs
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error(`Invalid payment amount: ${amount}`);
  }

  const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'];
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  // Simulate gateway response time
  const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const gatewayFee = Math.floor(amount * 0.029) + 30; // 2.9% + 30 cents

  return {
    transactionId,
    status: 'SUCCESS',
    amount,
    currency,
    gatewayFee,
    netAmount: amount - gatewayFee,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Simulate transaction history lookup.
 */
function getTransactionHistory(userId) {
  const MOCK_TRANSACTIONS = [
    { id: 'TXN_001', amount: 4999, currency: 'USD', status: 'SUCCESS', date: '2026-05-15' },
    { id: 'TXN_002', amount: 1299, currency: 'USD', status: 'SUCCESS', date: '2026-05-14' },
    { id: 'TXN_003', amount: 8500, currency: 'INR', status: 'REFUNDED', date: '2026-05-13' },
  ];
  return MOCK_TRANSACTIONS.filter(() => Math.random() > 0.1); // Simulate occasional empty results
}

// GET /health — Health check endpoint
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

// GET /work — Simulate payment processing
app.get('/work', (req, res) => {
  try {
    const amount = Math.floor(Math.random() * 10000) + 100; // Random amount 100–10100 cents
    const currencies = ['USD', 'EUR', 'GBP', 'INR'];
    const currency = currencies[Math.floor(Math.random() * currencies.length)];

    const transaction = processPayment(amount, currency);
    const history = getTransactionHistory('usr_001');

    res.json({
      success: true,
      service: SERVICE_NAME,
      result: {
        transaction,
        recentTransactions: history,
        processingTimeMs: Math.floor(Math.random() * 200) + 50,
      },
    });
  } catch (error) {
    logError(`Payment processing failed: ${error.message}`);
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
