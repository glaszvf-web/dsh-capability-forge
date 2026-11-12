/**
 * 统计一个目录下各类文件的数量和总体积
 * 缺口 g-20261109-002
 */

import fsp from 'node:fs/promises';
import path from 'node:path';

export const TOOL = {
  name: 'dir_stats',
  description: '统计一个目录下各类文件的数量和总体积，按扩展名分组。想知道一个文件夹都有什么、占多大时使用。',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: '要统计的目录绝对路径' },
      depth: { type: 'number', description: '递归深度，默认 3；0 表示只看本层', minimum: 0, maximum: 8 },
      topN: { type: 'number', description: '只返回体积最大的前 N 类，默认 15', minimum: 1, maximum: 50 },
    },
    required: ['input'],
    additionalProperties: false,
  },
};

export const HINT = '需要知道某个目录里有什么、各占多少空间时，调 dir_stats。';

/** 递归遍历，返回所有文件的 {path, size, ext} */
async function walk(root, maxDepth) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
    catch { continue; }   // 没权限就跳过，不中断整体统计

    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth) stack.push({ dir: p, depth: depth + 1 });
      } else if (e.isFile()) {
        try {
          const st = await fsp.stat(p);
          const ext = path.extname(e.name).toLowerCase() || '(无扩展名)';
          out.push({ path: p, size: st.size, ext });
        } catch { /* 读不到就跳过 */ }
      }
    }
  }
  return out;
}

/** 人类可读体积 */
function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export async function run(args = {}) {
  const dir = args.input;
  const depth = args.depth ?? 3;
  const topN = args.topN ?? 15;

  if (!dir) return { ok: false, error: '缺少 input（目录路径）' };

  // 目录存在性
  let st;
  try { st = await fsp.stat(dir); }
  catch { return { ok: false, error: `目录不存在: ${dir}` }; }
  if (!st.isDirectory()) return { ok: false, error: `不是目录: ${dir}` };

  const files = await walk(dir, depth);

  if (!files.length) {
    return { ok: true, dir, total: 0, count: 0, bytes: 0, bytesHuman: '0 B', byExt: [] };
  }

  const groups = new Map();
  let totalBytes = 0;
  for (const f of files) {
    totalBytes += f.size;
    const g = groups.get(f.ext) || { ext: f.ext, count: 0, bytes: 0 };
    g.count++;
    g.bytes += f.size;
    groups.set(f.ext, g);
  }

  const byExt = [...groups.values()]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, topN)
    .map(g => ({
      ext: g.ext,
      count: g.count,
      bytes: g.bytes,
      bytesHuman: human(g.bytes),
      pct: +((g.bytes / totalBytes) * 100).toFixed(1),
    }));

  return {
    ok: true,
    dir,
    depth,
    count: files.length,
    total: totalBytes,
    bytesHuman: human(totalBytes),
    kinds: groups.size,
    byExt,
  };
}
