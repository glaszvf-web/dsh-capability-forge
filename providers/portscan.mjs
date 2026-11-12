/**
 * kit/providers/portscan.mjs — 端口占用速查
 *
 * 来由：2026-11-10 晚上起记忆星图服务，8898 到 8906 一路顺延，全是我以前起的
 * 僵尸进程没清。当时全靠手敲 Get-NetTCPConnection 一条条看。
 *
 * 和 sysinfo 的分工：sysinfo 看机器累不累，portscan 看网络口子被谁占着。
 */

import { execFileSync } from 'node:child_process';

export const TOOL = {
  name: 'portscan',
  description:
    '列出本机正在监听的端口，带进程名与 PID，也可单独探测某个端口是否占用。'
    + '怀疑「端口被抢」「服务没起来」「起了一堆僵尸」时使用。',
  parameters: {
    type: 'object',
    properties: {
      port: { type: 'integer', minimum: 1, maximum: 65535, description: '只查这一个端口；不给就列出全部监听' },
      range: { type: 'string', description: '端口区间，形如 "8898-8919"；与 port 二选一' },
    },
    required: [],
    additionalProperties: false,
  },
};

export const HINT = '排查服务起没起来、端口被谁占，调 portscan。';

/**
 * 一次取全部监听端口。
 *
 * ★ 2026-11-11 实测踩到的坑：**不能用 `-State Listen` 过滤**。
 * 这台机器上 Node 起的服务（比如 8903 的记忆星图），Get-NetTCPConnection 读出来
 * 的 State 字段是**空的** —— RemoteAddress 0.0.0.0 / RemotePort 0，但 State 空空如也。
 * 加上 -State Listen 一筛，这些全漏掉，查 8898-8919 会得出「一个都没有」的假结论，
 * 实际上服务正好好地在那儿应答。这种假阴性比查不出来更坏。
 *
 * 所以判断口径改成：State 明确是 Listen，**或者**（远端端口为 0 且远端地址是 0.0.0.0）——
 * 后者是监听套接字的特征，不管 State 报没报。
 *
 * 全量 1152 条连接，在 PowerShell 里先筛再传，只回十几行，不会慢。
 */
function listListeners() {
  const ps = [
    'Get-NetTCPConnection',
    '| Where-Object { $_.State -eq "Listen" -or ($_.RemotePort -eq 0 -and $_.RemoteAddress -eq "0.0.0.0") }',
    '| Select-Object LocalAddress,LocalPort,State,OwningProcess',
    '| ConvertTo-Json -Compress',
  ].join(' ');
  const out = execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  if (!out || !out.trim()) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** PID → 进程名（一次批量查，别一个 PID 起一次进程） */
function procNames(pids) {
  const uniq = [...new Set(pids)].filter((p) => p && p > 0);
  if (!uniq.length) return new Map();
  const filter = uniq.map((p) => `ProcessId=${p}`).join(' OR ');
  const ps = `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,Name | ConvertTo-Json -Compress`;
  try {
    const out = execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8', timeout: 20000, windowsHide: true,
    });
    if (!out || !out.trim()) return new Map();
    const parsed = JSON.parse(out);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return new Map(arr.map((x) => [x.ProcessId, x.Name]));
  } catch {
    return new Map();
  }
}

export async function run(args = {}) {
  const t0 = Date.now();
  let rows;
  try {
    rows = listListeners();
  } catch (e) {
    return { ok: false, error: `查不到端口列表：${e.message}` };
  }

  let want = null;
  if (Number.isInteger(args.port)) {
    want = (p) => p === args.port;
  } else if (typeof args.range === 'string') {
    const m = args.range.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const lo = Math.min(+m[1], +m[2]);
      const hi = Math.max(+m[1], +m[2]);
      want = (p) => p >= lo && p <= hi;
    }
  }

  const picked = rows
    .map((r) => ({
      port: r.LocalPort,
      addr: r.LocalAddress,
      pid: r.OwningProcess,
      // State 报空的很可能是 Node/libuv 起的服务，照样算占用，只是标出来
      state: r.State || '(未报)',
    }))
    .filter((r) => (want ? want(r.port) : true))
    .sort((a, b) => a.port - b.port);

  const names = procNames(picked.map((r) => r.pid));
  const list = picked.map((r) => ({
    port: r.port,
    addr: r.addr,
    pid: r.pid,
    state: r.state,
    proc: names.get(r.pid) || '(查不到，可能已退出)',
  }));

  // 同一个进程占多个端口时，指出它 —— 僵尸服务往往就是这个特征
  const byPid = new Map();
  for (const r of list) byPid.set(r.pid, (byPid.get(r.pid) || 0) + 1);
  const multi = [...byPid.entries()].filter(([, n]) => n > 1).map(([pid, n]) => ({ pid, n, proc: names.get(pid) || '?' }));

  return {
    ok: true,
    filter: args.port ? `port=${args.port}` : args.range ? `range=${args.range}` : 'all',
    count: list.length,
    listeners: list,
    multiPortProcs: multi,
    ms: Date.now() - t0,
  };
}
