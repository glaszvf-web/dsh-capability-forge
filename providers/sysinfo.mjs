/**
 * kit/providers/sysinfo.mjs — 示例 provider：本机状态速查
 *
 * 这个文件是「怎么加一个能力」的活样板。
 * 复制这个文件、改 TOOL 和 run，就是新能力 —— 主程序一行不用动。
 */

import os from 'node:os';

export const TOOL = {
  name: 'sysinfo',
  description: '查询本机当前状态：CPU 型号与负载、内存占用、运行时长、当前时间。需要了解机器负荷时使用。',
  parameters: {
    type: 'object',
    properties: {
      detail: {
        type: 'string',
        enum: ['brief', 'full'],
        description: 'brief 只给关键几项；full 额外给每核负载和网卡',
      },
    },
    required: [],
    additionalProperties: false,
  },
};

export const HINT = '要判断这台机器现在累不累、内存够不够，调 sysinfo。';

export async function run(args = {}) {
  const detail = args.detail || 'brief';
  const cpus = os.cpus();
  const total = os.totalmem();
  const free = os.freemem();
  const usedPct = ((total - free) / total) * 100;

  // CPU 负载：用两次采样算差值（os.loadavg 在 Windows 上不可用）
  const sample = () => cpus.map(c => {
    const t = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { idle: c.times.idle, total: t };
  });
  const s1 = sample();
  await new Promise(r => setTimeout(r, 120));
  const s2 = sample();

  const perCore = s2.map((v, i) => {
    const dt = v.total - s1[i].total;
    const di = v.idle - s1[i].idle;
    return dt > 0 ? Math.round((1 - di / dt) * 100) : 0;
  });
  const avgLoad = Math.round(perCore.reduce((a, b) => a + b, 0) / perCore.length);

  const out = {
    ok: true,
    cpu: {
      model: (cpus[0]?.model || 'unknown').trim(),
      cores: cpus.length,
      loadPct: avgLoad,
    },
    mem: {
      totalGB: +(total / 1e9).toFixed(1),
      freeGB: +(free / 1e9).toFixed(1),
      usedPct: +usedPct.toFixed(1),
    },
    uptimeHours: +(os.uptime() / 3600).toFixed(1),
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    platform: `${os.platform()} ${os.arch()}`,
  };

  if (detail === 'full') {
    out.perCore = perCore;
    out.nics = Object.entries(os.networkInterfaces())
      .filter(([, v]) => v?.some(a => !a.internal))
      .map(([name, v]) => ({
        name,
        addr: v.filter(a => !a.internal).map(a => a.address).join(', '),
      }));
  }

  return out;
}
