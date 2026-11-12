/**
 * kit/providers/_registry.mjs — 插件发现与调用
 *
 * 流程参考：gddxx-jarvis（GPL-3.0）的 plugins/ 目录设计与 docs/extend.md
 *   本文件为独立实现，未包含该项目的任何源码。
 * 核心口号（他的原话，我照抄）：
 *   「加能力 = 加一个工具，不用改主程序。」
 *
 * 我的改造
 *   1. 语言从 Python 换成 ESM —— 单文件、零构建、能直接在 Node 和浏览器里跑
 *   2. 增加 config 开关（照他的 plugins:{name:false}）
 *   3. 增加「约定优于配置」的默认值：不写 schema 的纯数据 provider 也能挂
 *
 * 约定
 *   目录下的 *.mjs（下划线开头的是内部文件，跳过）
 *   每个文件导出下列之一：
 *     A) TOOL + run        —— 单工具
 *     B) provide()         —— 多工具，返回 [[TOOL, fn], ...]
 *   可选导出 HINT（字符串），会被收集起来追加到提示词
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateProvider, validate } from './_schema.mjs';

/* =====================================================================
   Registry
   ===================================================================== */

export function createRegistry(opts = {}) {
  const configPath = opts.configPath || null;       // 可选：{ "plugins": { "name": false } }
  let config = { plugins: {} };
  const tools = new Map();       // name -> { tool, fn, provider, file }
  const hints = [];              // 收集到的 HINT
  const errors = [];             // 加载期的错误（不吞）
  const disabled = new Set();    // 被 config 关掉的

  /* ---------- 配置 ---------- */
  async function loadConfig() {
    if (!configPath || !fs.existsSync(configPath)) return;
    try {
      config = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    } catch (e) {
      errors.push(`配置文件解析失败 ${configPath}: ${e.message}`);
    }
  }

  function isDisabled(providerName) {
    const p = config.plugins || {};
    return p[providerName] === false;
  }

  /* ---------- 发现 ---------- */
  async function discover(dir) {
    await loadConfig();
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
    catch (e) { errors.push(`目录读取失败 ${dir}: ${e.message}`); return []; }

    const found = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.endsWith('.mjs')) continue;
      if (e.name.startsWith('_')) continue;          // 内部文件
      if (e.name === 'README.md') continue;
      const providerName = e.name.replace(/\.mjs$/, '');
      if (isDisabled(providerName)) { disabled.add(providerName); continue; }
      found.push({ name: providerName, file: path.join(dir, e.name) });
    }
    return found;
  }

  /* ---------- 加载 ---------- */
  async function loadAll(dir) {
    const found = await discover(dir);
    for (const f of found) {
      let mod;
      try {
        mod = await import(pathToFileURL(f.file).href);
      } catch (e) {
        errors.push(`导入失败 ${f.name}: ${e.message}`);
        continue;
      }

      const { errs, tools: ts } = validateProvider(mod, f.name);
      if (errs.length) { errors.push(...errs); continue; }

      for (const { tool, fn } of ts) {
        if (tools.has(tool.name)) {
          errors.push(`工具名冲突: ${tool.name}（${f.name} 与 ${tools.get(tool.name).provider}）`);
          continue;
        }
        tools.set(tool.name, { tool, fn, provider: f.name, file: f.file });
      }
      if (typeof mod.HINT === 'string' && mod.HINT.trim()) {
        hints.push({ provider: f.name, text: mod.HINT.trim() });
      }
    }

    return { count: tools.size, providers: found.length, errors: errors.slice(), hints: hints.slice(), disabled: [...disabled] };
  }

  /* ---------- 调用 ---------- */
  async function call(name, args = {}) {
    const t = tools.get(name);
    if (!t) return { ok: false, error: `没有这个工具: ${name}` };

    // 参数校验（有 schema 才校验）
    const errs = validate(args, t.tool.parameters);
    if (errs.length) return { ok: false, error: '参数校验失败', details: errs };

    const t0 = Date.now();
    try {
      const r = await t.fn(args);
      return normalize(r, Date.now() - t0);
    } catch (e) {
      return { ok: false, error: e.message, ms: Date.now() - t0 };
    }
  }

  /** 统一返回值形状：{ ok, ... } */
  function normalize(r, ms) {
    if (r && typeof r === 'object' && 'ok' in r) return { ...r, ms };
    if (typeof r === 'string') return { ok: true, text: r, ms };
    return { ok: true, data: r, ms };
  }

  /* ---------- 对外 ---------- */
  function list() {
    return [...tools.values()].map(({ tool, provider, file }) => ({ ...tool, provider, file }));
  }

  function describe() {
    return {
      providers: new Set([...tools.values()].map(t => t.provider)).size,
      tools: tools.size,
      names: [...tools.keys()],
      hints,
      errors,
    };
  }

  return { loadAll, discover, call, list, describe, get errors() { return errors.slice(); }, get hints() { return hints.slice(); } };
}

/* =====================================================================
   自测
   ===================================================================== */

export async function selfTest() {
  const bad = [];
  const fsx = await import('node:fs/promises');
  const os = await import('node:os');

  const tmp = await fsx.mkdtemp(path.join(os.tmpdir(), 'kit-prov-'));

  // 造两个合法 provider + 一个坏 provider + 一个内部文件
  await fsx.writeFile(path.join(tmp, 'good.mjs'), `
export const TOOL = { name: 'good_add', description: 'add two numbers',
  parameters: { type:'object', properties:{ a:{type:'number'}, b:{type:'number'} }, required:['a','b'] } };
export const HINT = '可用 good_add 做加法。';
export async function run(args){ return { ok:true, sum: args.a + args.b }; }
`);
  await fsx.writeFile(path.join(tmp, 'multi.mjs'), `
const T1 = { name:'multi_echo', description:'echo', parameters:{ type:'object', properties:{ s:{type:'string'} } } };
const T2 = { name:'multi_bool', description:'bool', parameters:{ type:'object', properties:{ v:{type:'boolean'} } } };
export function provide(){ return [[T1, async ({s}) => ({ ok:true, echoed:s })], [T2, async ({v}) => ({ ok:true, got:v })]]; }
`);
  await fsx.writeFile(path.join(tmp, '_internal.mjs'), `export const x = 1;`);
  await fsx.writeFile(path.join(tmp, 'bad.mjs'), `export const TOOL = { name:'bad' };`);

  const reg = createRegistry();
  const info = await reg.loadAll(tmp);

  if (info.count !== 3) bad.push(`应加载 3 个工具，实际 ${info.count}`);
  if (!info.errors.length) bad.push('坏 provider 应该报错但没报');
  if (!info.hints.length) bad.push('HINT 未收集');

  // 正常调用
  const r1 = await reg.call('good_add', { a: 2, b: 3 });
  if (!r1.ok || r1.sum !== 5) bad.push(`good_add 调用失败: ${JSON.stringify(r1)}`);

  // 参数校验拦截
  const r2 = await reg.call('good_add', { a: 'x' });
  if (r2.ok || !r2.details?.length) bad.push('参数校验没拦住错误类型');

  // provide() 多工具
  const r3 = await reg.call('multi_echo', { s: 'hi' });
  if (!r3.ok || r3.echoed !== 'hi') bad.push('provide() 多工具调用失败');

  // 不存在的工具
  const r4 = await reg.call('nope', {});
  if (r4.ok) bad.push('不存在的工具应该失败');

  // config 禁用
  await fsx.writeFile(path.join(tmp, 'cfg.json'), JSON.stringify({ plugins: { good: false } }));
  const reg2 = createRegistry({ configPath: path.join(tmp, 'cfg.json') });
  const info2 = await reg2.loadAll(tmp);
  if (info2.count !== 2) bad.push(`config 禁用后应剩 2 个工具，实际 ${info2.count}`);

  await fsx.rm(tmp, { recursive: true, force: true });
  return bad;
}
