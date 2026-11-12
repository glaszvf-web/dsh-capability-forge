/**
 * kit/providers/procs.mjs — 查进程
 *
 * 来由：端口被占、某个程序卡住、想知道「刚才起的那个还在不在」——
 * 这三件事我每个星期都要做一遍，每次都是现敲 tasklist 再自己筛。
 * 固定成工具，顺手把内存占用和 pid 排好。
 *
 * 为什么用 tasklist 而不是 PowerShell：tasklist 是原生 exe，100ms 出结果；
 * Get-Process 要起一个 PowerShell 宿主，1~2 秒，查个进程不值当。
 */

import { execFileSync } from 'node:child_process';

function parseTasklistCsv(out) {
  // 形如："node.exe","12345","Console","1","123,456 K"
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('"')) continue;
    const cells = t.match(/"([^"]*)"/g);
    if (!cells || cells.length < 5) continue;
    const [name, pid, , , mem] = cells.map(c => c.replace(/^"|"$/g, ''));
    const kb = Number(String(mem).replace(/[^\d]/g, ''));
    if (!Number.isFinite(kb)) continue;
    rows.push({ name, pid: Number(pid), memMB: +(kb / 1024).toFixed(1) });
  }
  return rows;
}

export const TOOL = {
  name: 'procs',
  description:
    '按进程名查本机正在跑的程序，返回 pid、内存占用，可按内存排序。'
    + '想知道「那个服务还在不在」「谁占了这么多内存」时使用。名字不区分大小写，支持部分匹配。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '进程名的一部分，例如 node、chrome。省略则列出占用最高的几个' },
      top: { type: 'integer', minimum: 1, maximum: 100, description: '最多返回几条，默认 15' },
      sortBy: {
        type: 'string',
        enum: ['mem', 'pid', 'name'],
        description: '排序方式，默认 mem（内存从大到小）',
      },
    },
  },
};

export async function run(args = {}) {
  const top = args.top ?? 15;
  const sortBy = args.sortBy ?? 'mem';
  const needle = typeof args.name === 'string' ? args.name.toLowerCase().trim() : '';

  let out;
  try {
    out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], {
      encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    });
  } catch (e) {
    return { ok: false, error: 'tasklist 跑不动：' + e.message };
  }

  let rows = parseTasklistCsv(out);
  const total = rows.length;
  if (needle) rows = rows.filter(r => r.name.toLowerCase().includes(needle));

  rows.sort((a, b) => {
    if (sortBy === 'pid') return a.pid - b.pid;
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return b.memMB - a.memMB;
  });

  const shown = rows.slice(0, top);
  const totalMem = rows.reduce((s, r) => s + r.memMB, 0);

  return {
    ok: true,
    total,
    matched: rows.length,
    shown: shown.length,
    totalMemMB: +totalMem.toFixed(1),
    items: shown,
  };
}
