/**
 * services/inventory-service/index.js
 * Inventory management microservice — simulates stock checks, reservations,
 * and warehouse operations.
 *
 * SENTINEL_META: service=inventory-service port=3003 version=1.0.0
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const SERVICE_NAME = 'inventory-service';
const PORT = process.env.PORT || 3103;
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

// Mock in-memory inventory store
const INVENTORY = {
  'PROD_LAPTOP_001': { name: 'ThinkPad X1 Carbon', stock: 42, reserved: 5, warehouse: 'WH-MUMBAI' },
  'PROD_PHONE_002': { name: 'Pixel 9 Pro', stock: 128, reserved: 12, warehouse: 'WH-DELHI' },
  'PROD_TABLET_003': { name: 'iPad Pro 13"', stock: 7, reserved: 2, warehouse: 'WH-BANGALORE' },
  'PROD_WATCH_004': { name: 'Apple Watch Series 10', stock: 55, reserved: 8, warehouse: 'WH-MUMBAI' },
};

/**
 * Check stock availability for a product.
 * @param {string} productId - Product identifier.
 * @returns {object} Stock availability result.
 */
function checkStock(productId) {
  const item = INVENTORY[productId];
  if (!item) {
    throw new Error(`Product not found in inventory: ${productId}`);
  }

  const available = item.stock - item.reserved;
  return {
    productId,
    name: item.name,
    totalStock: item.stock,
    reserved: item.reserved,
    available,
    warehouse: item.warehouse,
    inStock: available > 0,
    lowStock: available < 10,
  };
}

/**
 * Reserve stock for an order.
 * @param {string} productId - Product identifier.
 * @param {number} quantity - Quantity to reserve.
 */
function reserveStock(productId, quantity) {
  const item = INVENTORY[productId];
  if (!item) {
    throw new Error(`Product not found: ${productId}`);
  }

  const available = item.stock - item.reserved;
  if (available < quantity) {
    throw new Error(`Insufficient stock. Available: ${available}, Requested: ${quantity}`);
  }

  item.reserved += quantity;
  return {
    success: true,
    productId,
    quantityReserved: quantity,
    reservationId: `RES_${Date.now()}`,
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(), // 15 minute hold
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

// GET /work — Simulate inventory operations
app.get('/work', (req, res) => {
  try {
    const productIds = Object.keys(INVENTORY);
    const randomProduct = productIds[Math.floor(Math.random() * productIds.length)];

    const stockInfo = checkStock(randomProduct);
    let reservation = null;

    // Attempt a small reservation if stock is available
    if (stockInfo.available > 0) {
      reservation = reserveStock(randomProduct, 1);
      // Release immediately for simulation purposes
      INVENTORY[randomProduct].reserved -= 1;
    }

    res.json({
      success: true,
      service: SERVICE_NAME,
      result: {
        stockCheck: stockInfo,
        reservation,
        inventorySummary: {
          totalProducts: productIds.length,
          inStockProducts: productIds.filter(id => (INVENTORY[id].stock - INVENTORY[id].reserved) > 0).length,
        },
        processingTimeMs: Math.floor(Math.random() * 100) + 20,
      },
    });
  } catch (error) {
    logError(`Inventory operation failed: ${error.message}`);
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
