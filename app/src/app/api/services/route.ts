/**
 * app/src/app/api/services/route.ts
 * API route — returns all service statuses from the SQLite database.
 */

import { NextResponse } from 'next/server';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require(path.join(process.cwd(), '..', 'database', 'db.js'));
  await dbModule.init();
  return dbModule;
}

export async function GET() {
  try {
    const db = await getDb();
    const services = db.getAllServices();
    const summary  = db.getSystemSummary();

    return NextResponse.json({
      services,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /services] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch services', details: String(error) },
      { status: 500 }
    );
  }
}
