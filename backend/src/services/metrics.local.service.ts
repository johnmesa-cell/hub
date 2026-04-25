import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import type { ServerMetrics } from '../types';

let previousCpuSample = readCpuSample();

function readCpuSample() {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
    const parts = stat.trim().split(/\s+/).slice(1).map(Number);
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
    const total = parts.reduce((sum, value) => sum + value, 0);
    return { idle, total };
  } catch {
    return { idle: 0, total: 0 };
  }
}

function readCpuUsage() {
  const current = readCpuSample();
  const totalDelta = current.total - previousCpuSample.total;
  const idleDelta = current.idle - previousCpuSample.idle;
  previousCpuSample = current;

  if (totalDelta <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
}

function readMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    used,
    total,
    percent: total === 0 ? 0 : (used / total) * 100
  };
}

function readDisk() {
  try {
    const output = execSync('df -k /', { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    const parts = lines[1].trim().split(/\s+/);
    const total = Number(parts[1]) * 1024;
    const used = Number(parts[2]) * 1024;
    return {
      used,
      total,
      percent: total === 0 ? 0 : (used / total) * 100
    };
  } catch {
    return { used: 0, total: 0, percent: 0 };
  }
}

function readNetwork() {
  try {
    const content = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    let rxBytes = 0;
    let txBytes = 0;

    for (const line of content) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const [iface, values] = trimmed.split(':');
      if (!iface || !values) {
        continue;
      }
      const parts = values.trim().split(/\s+/).map(Number);
      rxBytes += Number(parts[0] ?? 0);
      txBytes += Number(parts[8] ?? 0);
    }

    return { rx_bytes: rxBytes, tx_bytes: txBytes };
  } catch {
    return { rx_bytes: 0, tx_bytes: 0 };
  }
}

export function getLocalMetrics(): ServerMetrics {
  const memory = readMemory();
  const disk = readDisk();

  return {
    cpu: {
      usage: Number(readCpuUsage().toFixed(2)),
      cores: os.cpus().length
    },
    ram: {
      used: memory.used,
      total: memory.total,
      percent: Number(memory.percent.toFixed(2))
    },
    disk: {
      used: disk.used,
      total: disk.total,
      percent: Number(disk.percent.toFixed(2))
    },
    network: readNetwork(),
    uptime: Math.floor(os.uptime())
  };
}
