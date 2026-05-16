'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SystemHealth } from '../components/ServiceCard';
import { IncidentFeed, ResolutionFeed } from '../components/IncidentFeed';
import { AgentLogPanel } from '../components/AgentLog';

// ---- Type Definitions ----
interface Service {
  id: number;
  name: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  port: number;
  last_checked: string | null;
  error_message: string | null;
  uptime_seconds: number;
}

interface SystemSummary {
  overallHealth: string;
  openIncidentsCount: number;
  resolvedTodayCount: number;
  criticalServicesCount: number;
  healthyServicesCount: number;
}

interface Incident {
  id: number;
  service_name: string;
  error_type: string;
  description: string;
  detected_at: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ESCALATED';
  severity: string;
  port?: number;
}

interface Resolution {
  id: number;
  incident_id: number;
  fix_description: string;
  applied_by: string;
  applied_at: string;
  success: number;
  notes: string | null;
  service_name: string;
  error_type: string;
  incident_description: string;
}

interface AgentLog {
  id: number;
  agent: string;
  action: string;
  details: string | null;
  timestamp: string;
}

// ---- Helper ----
function formatNow(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const HEALTH_BANNERS: Record<string, { icon: string; text: string }> = {
  HEALTHY:  { icon: '🟢', text: 'All Systems Operational — No active incidents detected.' },
  DEGRADED: { icon: '🟡', text: 'System Degraded — One or more services reporting warnings.' },
  CRITICAL: { icon: '🔴', text: 'CRITICAL ALERT — Services are failing. Sentinel Agent is responding...' },
};

// ---- Main Dashboard Page ----
export default function DashboardPage() {
  const [services, setServices]       = useState<Service[]>([]);
  const [summary, setSummary]         = useState<SystemSummary | null>(null);
  const [incidents, setIncidents]     = useState<{ open: Incident[]; investigating: Incident[]; resolved: Incident[] }>({ open: [], investigating: [], resolved: [] });
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [agentLogs, setAgentLogs]     = useState<AgentLog[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [servicesRes, incidentsRes] = await Promise.all([
        fetch('http://localhost:3099/api/services', { cache: 'no-store' }),
        fetch('http://localhost:3099/api/incidents', { cache: 'no-store' }),
      ]);

      if (!servicesRes.ok || !incidentsRes.ok) {
        throw new Error('API request failed');
      }

      const servicesData = await servicesRes.json();
      const incidentsData = await incidentsRes.json();

      setServices(servicesData.services || []);
      setSummary(servicesData.summary || null);
      setIncidents({
        open: incidentsData.open || [],
        investigating: incidentsData.investigating || [],
        resolved: incidentsData.resolved || [],
      });
      setResolutions(incidentsData.resolutions || []);
      setAgentLogs(incidentsData.agentLogs || []);
      setLastUpdated(formatNow());
      setError(null);
    } catch (err) {
      setError(`Failed to connect to API Server. Make sure 'npm run api' is running on port 3099. (${String(err)})`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 1s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle investigate button
  const handleInvestigate = async (incidentId: number) => {
    try {
      await fetch('http://localhost:3099/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId }),
      });
      await fetchData();
    } catch (err) {
      console.error('Failed to trigger investigation:', err);
    }
  };

  const overallHealth = summary?.overallHealth || 'UNKNOWN';
  const banner = HEALTH_BANNERS[overallHealth] || { icon: '❓', text: 'System status unknown' };
  const activeIncidents = [...incidents.open, ...incidents.investigating];
  const totalActiveCount = incidents.open.length + incidents.investigating.length;

  return (
    <div className="dashboard">
      {/* ─── Header ─── */}
      <header className="header" role="banner">
        <div className="container">
          <div className="header-inner">
            <div className="header-brand">
              <div className="header-logo" aria-hidden="true">🛡️</div>
              <div>
                <div className="header-title">Project Sentinel</div>
                <div className="header-subtitle">Autonomous Incident Resolution Engine</div>
              </div>
            </div>

            <div className="header-actions">
              <div className="live-indicator" aria-live="polite" aria-label="Live monitoring active">
                <div className="live-dot" />
                Live
              </div>
              <button
                className="btn btn-ghost"
                onClick={fetchData}
                id="refresh-dashboard-btn"
                aria-label="Refresh dashboard data"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main ─── */}
      <main className="main" id="main-content">
        <div className="container">

          {/* Error Banner */}
          {error && (
            <div
              className="system-banner CRITICAL"
              role="alert"
              aria-live="assertive"
              style={{ marginBottom: 'var(--space-6)' }}
            >
              <span className="banner-icon">⚠️</span>
              <span className="banner-text">{error}</span>
            </div>
          )}

          {/* Loading State */}
          {loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '80px' }} />
              ))}
            </div>
          )}

          {/* System Health Banner */}
          {!loading && summary && (
            <div
              className={`system-banner ${overallHealth}`}
              role="status"
              aria-live="polite"
              aria-label={`System status: ${overallHealth}`}
            >
              <span className="banner-icon">{banner.icon}</span>
              <span className="banner-text">{banner.text}</span>
              <span className="banner-time">Last checked: {lastUpdated}</span>
            </div>
          )}

          {/* ─── Stats Bar ─── */}
          {!loading && summary && (
            <div className="stats-bar" role="region" aria-label="System statistics">
              <div className="stat-card">
                <div className="stat-label">Active Incidents</div>
                <div className={`stat-value ${totalActiveCount > 0 ? 'critical' : 'healthy'}`}>
                  {totalActiveCount}
                </div>
                <div className="stat-meta">
                  {incidents.open.length} open · {incidents.investigating.length} investigating
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Resolved Today</div>
                <div className="stat-value healthy">{summary.resolvedTodayCount}</div>
                <div className="stat-meta">by Sentinel Agent</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Services Healthy</div>
                <div className="stat-value healthy">{summary.healthyServicesCount}</div>
                <div className="stat-meta">of {services.length} total</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Services Critical</div>
                <div className={`stat-value ${summary.criticalServicesCount > 0 ? 'critical' : 'healthy'}`}>
                  {summary.criticalServicesCount}
                </div>
                <div className="stat-meta">
                  {summary.criticalServicesCount === 0 ? 'No critical services' : 'Needs attention'}
                </div>
              </div>
            </div>
          )}

          {/* ─── Dashboard Grid ─── */}
          {!loading && (
            <div className="dashboard-grid">

              {/* System Health — full width */}
              <div className="grid-full" role="region" aria-labelledby="health-title">
                <h2 id="health-title" className="visually-hidden">System Health</h2>
                <SystemHealth
                  services={services}
                  overallHealth={overallHealth}
                />
              </div>

              {/* Active Incidents — left column */}
              <div className="grid-left" role="region" aria-labelledby="incidents-title">
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title">
                      <div className="panel-icon critical">🚨</div>
                      <h2 id="incidents-title" style={{ fontSize: '15px', fontWeight: 700 }}>
                        Active Incidents
                      </h2>
                    </div>
                    <span className={`panel-badge ${totalActiveCount === 0 ? 'zero' : ''}`}>
                      {totalActiveCount}
                    </span>
                  </div>
                  <div className="panel-body">
                    <IncidentFeed
                      incidents={activeIncidents}
                      onResolve={handleInvestigate}
                    />
                  </div>
                </div>
              </div>

              {/* Resolved by Claude — right column */}
              <div className="grid-right" role="region" aria-labelledby="resolved-title">
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title">
                      <div className="panel-icon healthy">✅</div>
                      <h2 id="resolved-title" style={{ fontSize: '15px', fontWeight: 700 }}>
                        Resolved by Claude
                      </h2>
                    </div>
                    <span className={`panel-badge zero`}>
                      {resolutions.length}
                    </span>
                  </div>
                  <div className="panel-body">
                    <ResolutionFeed resolutions={resolutions} />
                  </div>
                </div>
              </div>

              {/* Agent Activity Log — full width */}
              <div className="grid-full" role="region" aria-labelledby="agent-log-title">
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title">
                      <div className="panel-icon brand">🤖</div>
                      <h2 id="agent-log-title" style={{ fontSize: '15px', fontWeight: 700 }}>
                        Agent Activity Log
                      </h2>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      Main · Alpha (Debugger) · Beta (QA)
                    </span>
                  </div>
                  <div className="panel-body" style={{ maxHeight: '280px' }}>
                    <AgentLogPanel logs={agentLogs} />
                  </div>
                  {lastUpdated && (
                    <div className="last-updated">
                      Auto-refreshes every 1s · Last updated: {lastUpdated}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer
        role="contentinfo"
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: 'var(--space-4) 0',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--color-text-muted)',
        }}
      >
        <div className="container">
          Project Sentinel · Autonomous Incident Resolution Engine · Built with Claude
        </div>
      </footer>

      {/* Visually hidden utility class */}
      <style>{`
        .visually-hidden {
          position: absolute;
          width: 1px; height: 1px;
          padding: 0; margin: -1px;
          overflow: hidden;
          clip: rect(0,0,0,0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  );
}
