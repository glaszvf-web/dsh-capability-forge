/**
 * g-20261109-001 的测试。全过才算通过。
 * 用法：node test.mjs
 */

import * as mod from './tool.mjs';

const bad = [];

// 1. 形状检查
if (!mod.TOOL || !mod.TOOL.name) bad.push('缺少 TOOL.name');
if (typeof mod.run !== 'function') bad.push('缺少 run()');

// 2. 行为检查（草案阶段先放一个必失败的占位，逼着实现）
try {
  const r = await mod.run({ input: 'test' });
  if (!r || r.ok !== true) bad.push('run() 应返回 { ok: true }，实际: ' + JSON.stringify(r));
} catch (e) {
  bad.push('run() 抛异常: ' + e.message);
}

if (bad.length) {
  console.log('✗ 测试失败');
  for (const b of bad) console.log('   · ' + b);
  process.exit(1);
} else {
  console.log('✓ 测试通过');
}
