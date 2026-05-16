'use client';

import React from 'react';

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

interface IncidentFeedProps {
  incidents: Incident[];
  onResolve?: (id: number) => void;
}

interface ResolutionFeedProps {
  resolutions: Resolution[];
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

const BUG_TYPE_LABELS: Record<string, string> = {
  'CM-001': 'Syntax Error',
  'CM-002': 'Missing Dep',
  'CM-003': 'Logic Error',
  'CM-004': 'JSON Corrupt',
  'CM-005': 'Port Conflict',
  'UNKNOWN': 'Unknown',
};

export function IncidentFeed({ incidents, onResolve }: IncidentFeedProps) {
  if (incidents.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🎉</div>
        <div className="empty-title">No Active Incidents</div>
        <div className="empty-subtitle">All systems are operating normally</div>
      </div>
    );
  }

  return (
    <div className="incident-list" role="list" aria-label="Active incidents">
      {incidents.map(incident => (
        <div
          key={incident.id}
          className={`incident-item ${incident.status}`}
          role="listitem"
          aria-label={`Incident ${incident.id}: ${incident.service_name}`}
        >
          <div className="incident-header">
            <span className="incident-service">
              {incident.status === 'INVESTIGATING' ? '🔍' : '🚨'} {incident.service_name}
            </span>
            <span className="incident-id">#{incident.id}</span>
          </div>

          <div className="incident-description">
            {incident.description}
          </div>

          <div className="incident-meta">
            <span className="incident-type">
              {BUG_TYPE_LABELS[incident.error_type] || incident.error_type}
            </span>
            <span
              className={`status-badge ${incident.status}`}
              style={{ fontSize: '10px' }}
            >
              {incident.status}
            </span>
            <span className="incident-time">
              🕐 {formatTime(incident.detected_at)} · {formatRelativeTime(incident.detected_at)}
            </span>
            {onResolve && incident.status === 'OPEN' && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: '11px', padding: '2px 8px', marginLeft: 'auto' }}
                onClick={() => onResolve(incident.id)}
                id={`resolve-btn-${incident.id}`}
                aria-label={`Investigate incident ${incident.id}`}
              >
                🤖 Investigate
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResolutionFeed({ resolutions }: ResolutionFeedProps) {
  if (resolutions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🤖</div>
        <div className="empty-title">No Resolutions Yet</div>
        <div className="empty-subtitle">Run the Chaos Monkey, then the Sentinel Agent will auto-fix it</div>
      </div>
    );
  }

  return (
    <div aria-label="Resolved incidents" role="list">
      {resolutions.map(resolution => (
        <div
          key={resolution.id}
          className="resolution-item"
          role="listitem"
          aria-label={`Resolution ${resolution.id}`}
        >
          <div className="resolution-header">
            <span className="resolution-agent">
              ✅ {resolution.applied_by}
            </span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>→</span>
            <span className="resolution-service">{resolution.service_name}</span>
          </div>

          <div className="resolution-fix">
            {resolution.fix_description}
          </div>

          <div className="flex items-center gap-3">
            <span className="incident-type">
              {BUG_TYPE_LABELS[resolution.error_type] || resolution.error_type}
            </span>
            <span className="resolution-time">
              🕐 {formatTime(resolution.applied_at)} · {formatRelativeTime(resolution.applied_at)}
            </span>
            <span
              className={`status-badge ${resolution.success ? 'HEALTHY' : 'CRITICAL'}`}
              style={{ fontSize: '10px', marginLeft: 'auto' }}
            >
              {resolution.success ? '✅ Success' : '❌ Failed'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
