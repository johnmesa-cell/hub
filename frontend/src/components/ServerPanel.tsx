import { MetricBar } from './MetricBar';
import { MetricGauge } from './MetricGauge';
import type { ServerMetrics } from '../types';

function formatUptime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export function ServerPanel({ title, metrics }: { title: string; metrics: ServerMetrics }) {
  const alert = metrics.cpu.usage > 80 || metrics.ram.percent > 85;

  return (
    <section className={`server-panel ${alert ? 'alert' : ''}`}>
      <div className="server-panel-head">
        <div>
          <span className="eyebrow">Servidor</span>
          <h3>{title}</h3>
        </div>
        <span className={`status ${alert ? 'danger' : 'ok'}`}>{alert ? 'Atención' : 'Normal'}</span>
      </div>

      <div className="server-grid">
        <MetricGauge label="CPU" value={metrics.cpu.usage} />
        <MetricGauge label="RAM" value={metrics.ram.percent} />
      </div>

      <MetricBar label="Disco" value={metrics.disk.percent} tone="warm" />

      <div className="metric-inline">
        <div>
          <span>Red RX</span>
          <strong>{(metrics.network.rx_bytes / 1024).toFixed(1)} KB</strong>
        </div>
        <div>
          <span>Red TX</span>
          <strong>{(metrics.network.tx_bytes / 1024).toFixed(1)} KB</strong>
        </div>
        <div>
          <span>Uptime</span>
          <strong>{formatUptime(metrics.uptime)}</strong>
        </div>
      </div>
    </section>
  );
}
