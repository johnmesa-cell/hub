export function MetricBar({ label, value, tone = 'cool' }: { label: string; value: number; tone?: 'cool' | 'warm' }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="metric-bar">
      <div className="metric-bar-head">
        <span>{label}</span>
        <strong>{safeValue.toFixed(1)}%</strong>
      </div>
      <div className={`metric-bar-track ${tone}`}>
        <div className="metric-bar-fill" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
