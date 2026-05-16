/**
 * app/src/app/api/incidents/route.ts
 * API route — returns incidents and resolutions from the SQLite database.
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

    const openIncidents          = db.getIncidents('OPEN');
    const investigatingIncidents = db.getIncidents('INVESTIGATING');
    const resolvedIncidents      = db.getIncidents('RESOLVED');
    const resolutions            = db.getResolutions(20);
    const agentLogs              = db.getAgentLogs(30);

    return NextResponse.json({
      open:          openIncidents,
      investigating: investigatingIncidents,
      resolved:      resolvedIncidents,
      resolutions,
      agentLogs,
      counts: {
        open:          openIncidents.length,
        investigating: investigatingIncidents.length,
        resolved:      resolvedIncidents.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /incidents] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incidents', details: String(error) },
      { status: 500 }
    );
  }
}
