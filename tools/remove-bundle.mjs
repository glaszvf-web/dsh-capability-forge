#!/usr/bin/env node
/**
 * remove-bundle.mjs — 安全地从 profile 的 bundles 列表里摘掉一个包
 *
 * 用法：
 *   node remove-bundle.mjs --profile web     --name dsh-armory --dry
 *   node remove-bundle.mjs --profile desktop --name dsh-armory
 *   node remove-bundle.mjs --all --name dsh-armory
 *
 * 做的事：
 *   1. 备份 package.json（带时间戳）
 *   2. 从 dsh.profile.bundles 数组里移除指定名字
 *   3. 校验其余字段与数组长度
 *   4. 打印 diff
 *
 * 不做的事：
 *   · 不碰 dependencies（包还在 node_modules，随时能加回来）
 *   · 不重启宿主（要用户/我另外决定）
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const PROFILES_DIR = path.join(os.homedir(), '.dsh', 'profiles');

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') o.dry = true;
    else if (a === '--all') o.all = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

async function processProfile(profileName, name, dry) {
  const pkgPath = path.join(PROFILES_DIR, profileName, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log(`  · ${profileName}: package.json 不存在，跳过`);
    return { profile: profileName, changed: false, reason: 'no-file' };
  }

  const raw = await fsp.readFile(pkgPath, 'utf8');
  let j;
  try { j = JSON.parse(raw); }
  catch (e) {
    console.log(`  ✗ ${profileName}: JSON 解析失败 ${e.message}`);
    return { profile: profileName, changed: false, reason: 'bad-json' };
  }

  const bundles = j?.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) {
    console.log(`  · ${profileName}: 没有 dsh.profile.bundles 数组，跳过`);
    return { profile: profileName, changed: false, reason: 'no-bundles' };
  }

  const idx = bundles.indexOf(name);
  if (idx < 0) {
    console.log(`  · ${profileName}: bundles 里没有 ${name}`);
    return { profile: profileName, changed: false, reason: 'not-found' };
  }

  // 安全检查：不能把基础包摘空
  if (bundles.length <= 3) {
    console.log(`  ✗ ${profileName}: bundles 只剩 ${bundles.length} 个，拒绝继续`);
    return { profile: profileName, changed: false, reason: 'too-few' };
  }

  const before = bundles.length;
  bundles.splice(idx, 1);
  const after = bundles.length;

  console.log(`  ${profileName}: ${before} → ${after}  移除 "${name}" (第 ${idx + 1} 项)`);

  if (dry) {
    console.log(`    [dry] 不写入`);
    return { profile: profileName, changed: false, reason: 'dry' };
  }

  // 备份
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${pkgPath}.bak-${stamp}-before-remove-${name.replace(/[/@]/g, '_')}`;
  await fsp.copyFile(pkgPath, bak);
  console.log(`    备份 → ${path.basename(bak)}`);

  // 校验：除 bundles 外其他字段必须完全一致
  const j2 = JSON.parse(raw);
  j2.dsh.profile.bundles = bundles;
  const beforeKeys = Object.keys(j).sort().join(',');
  const afterKeys = Object.keys(j2).sort().join(',');
  if (beforeKeys !== afterKeys) {
    console.log(`    ✗ 顶层键变了，中止`);
    return { profile: profileName, changed: false, reason: 'keys-changed' };
  }

  // 写回（保持 2 空格缩进 + 末尾换行）
  await fsp.writeFile(pkgPath, JSON.stringify(j2, null, 2) + '\n', 'utf8');

  // 复核
  const check = JSON.parse(await fsp.readFile(pkgPath, 'utf8'));
  const cb = check?.dsh?.profile?.bundles;
  if (!Array.isArray(cb) || cb.includes(name)) {
    console.log(`    ✗ 写回后复核失败`);
    return { profile: profileName, changed: false, reason: 'verify-failed' };
  }

  console.log(`    ✓ 已写入并复核通过（${cb.length} 个 bundle）`);
  return { profile: profileName, changed: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name;
  if (!name) {
    console.error('用法: node remove-bundle.mjs --profile web|desktop|--all --name <包名> [--dry]');
    process.exit(1);
  }

  let targets = [];
  if (args.all) {
    targets = (await fsp.readdir(PROFILES_DIR, { withFileTypes: true }))
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(n => !n.startsWith('.') && n !== 'node_modules');
  } else if (args.profile) {
    targets = [args.profile];
  } else {
    console.error('要么 --profile <名字>，要么 --all');
    process.exit(1);
  }

  console.log(`\n从 bundles 移除 "${name}"${args.dry ? '（dry run）' : ''}`);
  console.log(`profile 目录：${PROFILES_DIR}\n`);

  const results = [];
  for (const p of targets) {
    results.push(await processProfile(p, name, !!args.dry));
  }

  console.log('');
  const changed = results.filter(r => r.changed);
  if (changed.length) {
    console.log(`✓ 改了 ${changed.length} 个 profile：${changed.map(r => r.profile).join(', ')}`);
    console.log(`  ⚠️ 需要重启宿主（web）或重开 App（desktop）才生效`);
  } else {
    console.log(`没有改动（dry run 或未找到）`);
  }
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
