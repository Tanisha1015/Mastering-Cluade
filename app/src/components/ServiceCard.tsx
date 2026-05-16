'use client';

import React from 'react';

interface Service {
  id: number;
  name: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  port: number;
  last_checked: string | null;
  error_message: string | null;
  uptime_seconds: number;
}

interface ServiceCardProps {
  service: Service;
}

const STATUS_ICONS: Record<string, string> = {
  HEALTHY:  '✅',
  WARNING:  '⚠️',
  CRITICAL: '🚨',
  UNKNOWN:  '❓',
};

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function formatLastChecked(isoString: string | null): string {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  const now = new Date();
  const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSecs < 15) return 'Just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  return date.toLocaleTimeString();
}

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <div className={`service-card ${service.status}`} role="article" aria-label={`${service.name} status`}>
      <div className="service-card-top">
        <div>
          <div className="service-name">{service.name}</div>
          <div className="service-port">:{service.port}</div>
        </div>
        <span className={`status-badge ${service.status}`} aria-live="polite">
          {STATUS_ICONS[service.status]} {service.status}
        </span>
      </div>

      <div className="service-uptime">
        ⏱ Uptime: {formatUptime(service.uptime_seconds)}
        {' · '}
        🕐 {formatLastChecked(service.last_checked)}
      </div>

      {service.error_message && service.status !== 'HEALTHY' && (
        <div className="service-error" role="alert">
          {service.error_message.length > 120
            ? service.error_message.substring(0, 120) + '...'
            : service.error_message}
        </div>
      )}
    </div>
  );
}

interface SystemHealthProps {
  services: Service[];
  overallHealth: string;
}

export function SystemHealth({ services, overallHealth }: SystemHealthProps) {
  const healthyCount = services.filter(s => s.status === 'HEALTHY').length;
  const total = services.length;
  const pct = total > 0 ? Math.round((healthyCount / total) * 100) : 0;

  const barClass =
    overallHealth === 'HEALTHY'   ? 'healthy' :
    overallHealth === 'DEGRADED'  ? 'degraded' :
    'critical';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <div className="panel-icon brand">🖥️</div>
          System Health
        </div>
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {healthyCount}/{total} services healthy
        </span>
      </div>

      <div className="service-grid">
        {services.map(service => (
          <ServiceCard key={service.id} service={service} />
        ))}

        {services.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="empty-icon">🔌</div>
            <div className="empty-title">No services registered</div>
            <div className="empty-subtitle">Run the health check poller to discover services</div>
          </div>
        )}
      </div>

      <div className="health-bar-wrapper">
        <span className="health-label">Health Score</span>
        <div className="health-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`health-bar-fill ${barClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="health-pct">{pct}%</span>
      </div>
    </div>
  );
}
