/**
 * app/src/app/api/resolve/route.ts
 * API route — manually triggers the Sentinel Agent's resolution loop
 * for a specific incident (for demo/testing purposes).
 */

import { NextResponse } from 'next/server';
import path from 'path';

export const dynamic = 'force-dynamic';

async function getDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require(path.join(process.cwd(), '..', 'database', 'db.js'));
  await dbModule.init();
  return dbModule;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { incidentId } = body;

    if (!incidentId) {
      return NextResponse.json({ error: 'incidentId is required' }, { status: 400 });
    }

    const db = await getDb();

    db.updateIncidentStatus(incidentId, 'INVESTIGATING');
    db.logAgentAction(
      'Dashboard-Trigger',
      `Manual resolution triggered for incident #${incidentId}`,
      `Triggered via dashboard at ${new Date().toISOString()}`
    );

    return NextResponse.json({
      success:   true,
      message:   `Incident #${incidentId} marked as INVESTIGATING. Run 'npm run sentinel' to auto-resolve.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /resolve] Error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger resolution', details: String(error) },
      { status: 500 }
    );
  }
}
