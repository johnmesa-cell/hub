export function MetricGauge({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="gauge" style={{ ['--gauge-value' as never]: `${safeValue}%` }}>
      <div className="gauge-ring">
        <strong>{safeValue.toFixed(1)}%</strong>
      </div>
      <span>{label}</span>
    </div>
  );
}
