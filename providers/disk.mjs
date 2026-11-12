/**
 * kit/providers/disk.mjs — 磁盘剩余
 *
 * 来由：盘身体检、清缓存、决定往哪写大文件时，第一句总是「还有多少地方」。
 * 原来靠 pwsh 的 Get-PSDrive 现敲，结果格式每次不一样，还得自己算 GB。
 * 固定成工具，输出统一，一次扫全部盘。
 *
 * 为什么不用 wmic：那东西在新 Windows 上已经被标记弃用，输出还会随版本变。
 * fs.statfsSync 是 Node 内置系统调用，零依赖、跨平台、字段稳定。
 */

import fs from 'node:fs';

const GB = 1024 ** 3;

export const TOOL = {
  name: 'disk',
  description:
    '列出本机各磁盘的总容量、已用、可用与使用率。想知道「还有多少空间」「哪个盘快满了」时使用。'
    + '默认只看存在且可读的盘，扫不到的直接跳过。',
  parameters: {
    type: 'object',
    properties: {
      warnAt: {
        type: 'integer',
        minimum: 50,
        maximum: 99,
        description: '使用率超过这个百分比就标记为紧张，默认 85',
      },
    },
  },
};

export async function run(args = {}) {
  const warnAt = args.warnAt ?? 85;
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const disks = [];

  for (const L of letters) {
    const root = `${L}:\\`;
    if (!fs.existsSync(root)) continue;
    let st;
    try { st = fs.statfsSync(root); } catch { continue; }
    const total = st.blocks * st.bsize;
    const free = st.bavail * st.bsize;
    if (!total) continue;
    const used = total - free;
    const pct = Math.round((used / total) * 100);
    disks.push({
      drive: `${L}:`,
      totalGB: +(total / GB).toFixed(1),
      usedGB: +(used / GB).toFixed(1),
      freeGB: +(free / GB).toFixed(1),
      usedPct: pct,
      tight: pct >= warnAt,
    });
  }

  if (!disks.length) return { ok: false, error: '一个盘都没扫到（statfs 不可用？）' };

  const tight = disks.filter(d => d.tight);
  return {
    ok: true,
    warnAt,
    count: disks.length,
    disks,
    summary: tight.length
      ? `有 ${tight.length} 个盘超过 ${warnAt}%：${tight.map(d => `${d.drive} ${d.usedPct}%`).join(' / ')}`
      : `都在 ${warnAt}% 以下`,
  };
}
