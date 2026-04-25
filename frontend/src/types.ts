export interface Project {
  id: number;
  name: string;
  slug: string;
  url: string;
  description: string | null;
  icon: string | null;
  active: number;
  sort_order: number;
}

export interface MetricCpu {
  usage: number;
  cores: number;
}

export interface MetricRam {
  used: number;
  total: number;
  percent: number;
}

export interface MetricDisk {
  used: number;
  total: number;
  percent: number;
}

export interface MetricNetwork {
  rx_bytes: number;
  tx_bytes: number;
}

export interface ServerMetrics {
  cpu: MetricCpu;
  ram: MetricRam;
  disk: MetricDisk;
  network: MetricNetwork;
  uptime: number;
}

export interface MetricsSnapshot {
  server1: ServerMetrics;
  server2: ServerMetrics;
}
