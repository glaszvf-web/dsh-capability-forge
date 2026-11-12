/**
 * g-20261109-002 的测试。全过才算通过。
 * 用法：node test.mjs
 */

import * as mod from './tool.mjs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const bad = [];

/* ---------- 1. 形状检查 ---------- */
if (!mod.TOOL || !mod.TOOL.name) bad.push('缺少 TOOL.name');
if (mod.TOOL?.name !== 'dir_stats') bad.push(`TOOL.name 应为 dir_stats，实际 ${mod.TOOL?.name}`);
if (typeof mod.run !== 'function') bad.push('缺少 run()');
if (!mod.TOOL?.parameters || mod.TOOL.parameters.type !== 'object') bad.push('parameters 不是 object schema');

/* ---------- 2. 造一个已知结构的临时目录 ---------- */
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'dirstat-'));
await fsp.mkdir(path.join(tmp, 'sub'), { recursive: true });
await fsp.writeFile(path.join(tmp, 'a.txt'), 'x'.repeat(100));        // 100 B
await fsp.writeFile(path.join(tmp, 'b.txt'), 'y'.repeat(200));        // 200 B
await fsp.writeFile(path.join(tmp, 'c.js'), 'z'.repeat(300));         // 300 B
await fsp.writeFile(path.join(tmp, 'sub', 'd.txt'), 'w'.repeat(50));  // 50 B

/* ---------- 3. 行为检查 ---------- */
const r = await mod.run({ input: tmp });
if (!r || r.ok !== true) {
  bad.push('run() 应返回 { ok: true }，实际: ' + JSON.stringify(r));
} else {
  if (r.count !== 4) bad.push(`应统计到 4 个文件，实际 ${r.count}`);
  if (r.total !== 650) bad.push(`总体积应为 650 字节，实际 ${r.total}`);

  const txt = r.byExt.find(x => x.ext === '.txt');
  if (!txt) bad.push('没统计出 .txt 分组');
  else {
    if (txt.count !== 3) bad.push(`.txt 应有 3 个，实际 ${txt.count}`);
    if (txt.bytes !== 350) bad.push(`.txt 应有 350 字节，实际 ${txt.bytes}`);
  }

  const js = r.byExt.find(x => x.ext === '.js');
  if (!js || js.count !== 1) bad.push('.js 分组错误');

  // 分组按体积降序
  for (let i = 1; i < r.byExt.length; i++) {
    if (r.byExt[i].bytes > r.byExt[i - 1].bytes) { bad.push('分组未按体积降序'); break; }
  }
}

/* ---------- 4. 边界情况 ---------- */
const r0 = await mod.run({ input: tmp, depth: 0 });
if (r0.ok && r0.count !== 3) bad.push(`depth:0 应只统计本层 3 个，实际 ${r0.count}`);

const rBad = await mod.run({ input: path.join(tmp, '__不存在的目录__') });
if (rBad.ok) bad.push('不存在的目录应返回 ok:false');

const rNoArg = await mod.run({});
if (rNoArg.ok) bad.push('缺参数应返回 ok:false');

const rFile = await mod.run({ input: path.join(tmp, 'a.txt') });
if (rFile.ok) bad.push('传文件路径应返回 ok:false（不是目录）');

await fsp.rm(tmp, { recursive: true, force: true });

/* ---------- 结果 ---------- */
if (bad.length) {
  console.log('✗ 测试失败');
  for (const b of bad) console.log('   · ' + b);
  process.exit(1);
} else {
  console.log('✓ 测试通过（形状 / 统计准确性 / 深度 / 异常输入，共 12 项检查）');
}
