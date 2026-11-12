/**
 * kit/providers/recent.mjs — 最近改动的文件
 *
 * 来由：收尾核对「这一轮到底动了哪些文件」时，我每次都在现写 Get-ChildItem + Where-Object。
 * 而且经常漏掉藏在子目录里的那几个。固定成工具，一次说清楚。
 *
 * 和 dirstats 的分工：dirstats 看体量分布，recent 看时间线。
 */

import fs from 'node:fs';
import path from 'node:path';

export const TOOL = {
  name: 'recent',
  description:
    '列出某个目录下最近改动过的文件，按修改时间倒序。想知道「刚才那一轮动了什么」'
    + '或「这个项目最近还在动吗」时使用。',
  parameters: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: '要扫的目录绝对路径' },
      hours: { type: 'number', minimum: 0.05, maximum: 8760, description: '最近多少小时内，默认 24' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: '最多返回几条，默认 25' },
      ext: {
        type: 'array',
        items: { type: 'string' },
        description: '只保留这些扩展名，比如 [".mjs",".md"]；不给就全要',
      },
      depth: { type: 'integer', minimum: 1, maximum: 12, description: '递归深度，默认 6' },
    },
    required: ['dir'],
    additionalProperties: false,
  },
};

export const HINT = '收尾核对改动、判断项目是否还在动，调 recent。';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache', 'out']);

export async function run(args = {}) {
  const dir = args.dir;
  if (!dir || typeof dir !== 'string') return { ok: false, error: 'dir 必填' };
  if (!fs.existsSync(dir)) return { ok: false, error: `目录不存在：${dir}` };

  const hours = args.hours ?? 24;
  const limit = args.limit ?? 25;
  const maxDepth = args.depth ?? 6;
  const exts = args.ext && args.ext.length ? new Set(args.ext.map((e) => (e.startsWith('.') ? e : '.' + e).toLowerCase())) : null;
  const since = Date.now() - hours * 3600000;

  const hits = [];
  let scanned = 0;

  const walk = (cur, depth) => {
    if (depth > maxDepth || scanned > 200000) return;
    let items;
    try { items = fs.readdirSync(cur, { withFileTypes: true }); } catch { return; }
    for (const e of items) {
      scanned++;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        walk(full, depth + 1);
      } else if (e.isFile()) {
        if (exts && !exts.has(path.extname(e.name).toLowerCase())) continue;
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.mtimeMs < since) continue;
        hits.push({ path: full, mtimeMs: st.mtimeMs, kb: +(st.size / 1024).toFixed(1) });
      }
    }
  };

  const t0 = Date.now();
  walk(path.resolve(dir), 0);

  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const total = hits.length;
  const shown = hits.slice(0, limit);

  return {
    ok: true,
    dir: path.resolve(dir),
    window: `最近 ${hours} 小时`,
    matched: total,
    shown: shown.length,
    truncated: total > shown.length,
    files: shown.map((h) => ({
      path: h.path,
      kb: h.kb,
      at: new Date(h.mtimeMs).toLocaleString('zh-CN', { hour12: false }),
      minsAgo: Math.round((Date.now() - h.mtimeMs) / 60000),
    })),
    ms: Date.now() - t0,
  };
}
