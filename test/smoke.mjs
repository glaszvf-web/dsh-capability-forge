#!/usr/bin/env node
/**
 * test/smoke.mjs —— 能力锻造套件 · 包内自测
 *
 * 三件事：
 *   1. 加载器机制自测（含坏 provider 拦截、参数校验、provide() 多工具、config 禁用）
 *   2. 缺口闭环状态机自测（含 promote 门禁）
 *   3. 真实加载 providers/ 目录并真调一次 sysinfo —— 证明这几个 provider 在这台机器上活着
 *
 * 用法：
 *   node test/smoke.mjs
 *
 * 退出码：0 全过 / 1 有失败项。
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.dirname(HERE);

/* Windows 上 import() 只认 file:// URL，直接喂 E:\... 会被解析成 e: 协议 */
const imp = (rel) => import(pathToFileURL(path.join(PKG, rel)).href);

const pass = [];
const fail = [];

function check(name, ok, detail) {
  if (ok) pass.push(name);
  else fail.push(detail ? `${name} —— ${detail}` : name);
}

/* ── 1. 加载器机制 ── */
{
  const { createRegistry, selfTest } = await imp('providers/_registry.mjs');

  let bad = [];
  try { bad = await selfTest(); } catch (e) { bad = [`selfTest 抛异常: ${e.message}`]; }
  check('providers/_registry 机制自测', bad.length === 0, bad.join('; '));

  /* ── 3. 真实加载 providers/ ── */
  const reg = createRegistry();
  const info = await reg.loadAll(path.join(PKG, 'providers'));
  check('真实 providers 加载', info.count >= 4 && info.errors.length === 0,
    `已载 ${info.count} 个工具 / ${info.providers} 个 provider，错误: ${JSON.stringify(info.errors)}`);

  const r = await reg.call('sysinfo', {});
  check('真调 sysinfo', r && r.ok === true, JSON.stringify(r).slice(0, 200));
}

/* ── 2. 缺口闭环 → 先自测，再确认 propose→tested 门禁在源码里 ── */
{
  const { selfTest } = await imp('gaps/gaps.mjs');
  let bad = [];
  try { bad = await selfTest(); } catch (e) { bad = [`selfTest 抛异常: ${e.message}`]; }
  check('gaps 状态机自测', bad.length === 0, bad.join('; '));
}

/* ── 报告 ── */
console.log('\n══ 能力锻造套件 · 自测 ══\n');
for (const p of pass) console.log('  ✓ ' + p);
for (const f of fail) console.log('  ✗ ' + f);
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`);

process.exit(fail.length ? 1 : 0);
