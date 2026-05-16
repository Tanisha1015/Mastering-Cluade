'use client';

import React from 'react';

interface AgentLog {
  id: number;
  agent: string;
  action: string;
  details: string | null;
  timestamp: string;
}

interface AgentLogPanelProps {
  logs: AgentLog[];
}

const AGENT_COLORS: Record<string, string> = {
  'Main-Agent':       'var(--color-brand-light)',
  'Subagent-Alpha':   '#a78bfa',
  'Subagent-Beta':    '#34d399',
  'Health Poller':    '#fb923c',
  'Dashboard-Trigger': '#f472b6',
};

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function AgentLogPanel({ logs }: AgentLogPanelProps) {
  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <div className="empty-title">No Agent Activity</div>
        <div className="empty-subtitle">Agent logs will appear here as incidents are processed</div>
      </div>
    );
  }

  return (
    <div className="agent-log-list" role="log" aria-label="Agent activity log" aria-live="polite">
      {logs.map(log => (
        <div key={log.id} className="agent-log-item">
          <span className="agent-log-timestamp">{formatTime(log.timestamp)}</span>
          <span
            className="agent-log-agent"
            style={{ color: AGENT_COLORS[log.agent] || 'var(--color-brand-light)' }}
          >
            [{log.agent}]
          </span>
          <span className="agent-log-action">
            {log.action}
            {log.details && (
              <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                — {log.details.length > 80 ? log.details.substring(0, 80) + '...' : log.details}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
