/**
 * kit/providers/dirstats.mjs — 目录统计
 *
 * 来由：gaps 里那条 g-20261109-002「统计一个目录下各类文件的数量和总体积」
 * 当时只是演示流水线用的，转正了却从来没真接过。2026-11-11 补上，
 * 这样那条缺口才算真的兑现，不是挂在 active/ 里占位。
 *
 * 为什么不用 pwsh 一行：要分类聚合、要能设深度、要能跳过 node_modules，
 * 而且盘身体检时这种查询一次会调用好几遍，固定成工具比每次现写可靠。
 */

import fs from 'node:fs';
import path from 'node:path';

export const TOOL = {
  name: 'dirstats',
  description:
    '统计一个目录下各类文件的数量与总体积，按扩展名聚合。想知道「这堆文件都多大、哪种最多」时使用。'
    + '默认跳过 node_modules / .git 这类噪音目录。',
  parameters: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: '要统计的目录绝对路径' },
      depth: { type: 'integer', minimum: 1, maximum: 12, description: '递归深度，默认 6' },
      skip: {
        type: 'array',
        items: { type: 'string' },
        description: '额外要跳过的目录名（默认已含 node_modules/.git/dist 等）',
      },
      top: { type: 'integer', minimum: 1, maximum: 50, description: '只返回最大的前 N 类，默认 15' },
    },
    required: ['dir'],
    additionalProperties: false,
  },
};

export const HINT = '要盘某个目录的体量分布、找「谁占地方」时调 dirstats。';

const DEFAULT_SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache', 'out']);

export async function run(args = {}) {
  const dir = args.dir;
  if (!dir || typeof dir !== 'string') return { ok: false, error: 'dir 必填' };
  if (!fs.existsSync(dir)) return { ok: false, error: `目录不存在：${dir}` };

  const maxDepth = args.depth ?? 6;
  const top = args.top ?? 15;
  const skip = new Set([...DEFAULT_SKIP, ...(args.skip || [])]);

  const byExt = new Map();
  let files = 0, bytes = 0, dirs = 0, truncated = false;

  const walk = (cur, depth) => {
    if (depth > maxDepth || truncated) return;
    let items;
    try { items = fs.readdirSync(cur, { withFileTypes: true }); } catch { return; }
    for (const e of items) {
      if (files > 200000) { truncated = true; return; }
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        dirs++;
        walk(full, depth + 1);
      } else if (e.isFile()) {
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        const ext = (path.extname(e.name) || '(无扩展名)').toLowerCase();
        const rec = byExt.get(ext) || { n: 0, bytes: 0 };
        rec.n++;
        rec.bytes += st.size;
        byExt.set(ext, rec);
        files++;
        bytes += st.size;
      }
    }
  };

  const t0 = Date.now();
  walk(path.resolve(dir), 0);

  const list = [...byExt.entries()]
    .map(([ext, v]) => ({ ext, n: v.n, mb: +(v.bytes / 1048576).toFixed(2), pct: bytes ? +((v.bytes / bytes) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.mb - a.mb || b.n - a.n)
    .slice(0, top);

  return {
    ok: true,
    dir: path.resolve(dir),
    files,
    dirs,
    mb: +(bytes / 1048576).toFixed(2),
    gb: +(bytes / 1073741824).toFixed(3),
    byExt: list,
    truncated,
    ms: Date.now() - t0,
  };
}
