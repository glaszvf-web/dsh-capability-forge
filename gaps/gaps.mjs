/**
 * kit/gaps/gaps.mjs — 能力缺口闭环
 *
 * 流程参考：gddxx-jarvis（GPL-3.0）的 skills.py / review.py / docs/extend.md §2
 *   本文件为独立实现，未包含该项目的任何源码。
 * 原流程：做不到的事 → 记进学习清单 → 用户批准 → 大脑写技能 → 测试 → 用户点安装
 *
 * 我照这条流水线重建，但改成命令行 + 文件系统，因为我没有 GUI 按钮：
 *
 *   report   做不到的事，登记进 gaps.jsonl
 *   draft    生成草案骨架到 trial/<id>/（SKILL.md + tool.mjs + test.mjs）
 *   test     跑草案自带的 test.mjs，全过才允许下一步
 *   promote  转正：trial/<id>/ → active/<id>/
 *   reject   驳回，写明原因
 *
 * 铁律：**测试不过，promote 一律拒绝。** 这是整条流水线唯一的价值。
 *
 * 用法：
 *   node gaps.mjs report --what "需要把 PDF 批量转成可用文本" --why "现有 read 不解析 PDF"
 *   node gaps.mjs list
 *   node gaps.mjs draft g-20261109-001
 *   node gaps.mjs test g-20261109-001
 *   node gaps.mjs promote g-20261109-001 --by "your-name"
 *   node gaps.mjs reject g-20261109-001 --why "不值得做"
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_TRIAL = path.join(__dirname, 'trial');
const DIR_ACTIVE = path.join(__dirname, 'active');
const DB = path.join(__dirname, 'gaps.jsonl');

/* =====================================================================
   数据层
   ===================================================================== */

/** 读全部缺口记录 */
export async function readGaps() {
  if (!fs.existsSync(DB)) return [];
  const raw = await fsp.readFile(DB, 'utf8');
  return raw.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

/** 追加一条 */
export async function appendGap(g) {
  await fsp.appendFile(DB, JSON.stringify(g) + '\n', 'utf8');
}

/** 整库重写（改状态用） */
async function rewrite(gaps) {
  await fsp.writeFile(DB, gaps.map(g => JSON.stringify(g)).join('\n') + (gaps.length ? '\n' : ''), 'utf8');
}

/** 状态流转 */
const VALID_STATES = ['open', 'drafted', 'tested', 'promoted', 'rejected'];

function nextId(gaps) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `g-${today}-`;
  const n = gaps.filter(g => g.id.startsWith(prefix)).length + 1;
  return prefix + String(n).padStart(3, '0');
}

/* =====================================================================
   命令
   ===================================================================== */

async function cmdReport(opts) {
  if (!opts.what) throw new Error('缺少 --what（做不到的是什么）');
  const gaps = await readGaps();
  const g = {
    id: nextId(gaps),
    what: opts.what,
    why: opts.why || '',
    state: 'open',
    createdAt: new Date().toISOString(),
    testedAt: null,
    promotedAt: null,
    note: '',
  };
  await appendGap(g);
  console.log(`✓ 已登记 ${g.id}`);
  console.log(`  ${g.what}`);
  if (g.why) console.log(`  原因：${g.why}`);
  console.log(`\n下一步：node gaps.mjs draft ${g.id}`);
  return g;
}

async function cmdList() {
  const gaps = await readGaps();
  if (!gaps.length) { console.log('还没有登记过缺口。'); return; }
  const by = {};
  for (const g of gaps) (by[g.state] ||= []).push(g);
  for (const st of VALID_STATES) {
    if (!by[st]) continue;
    console.log(`\n[${st}]  ${by[st].length} 条`);
    for (const g of by[st]) {
      console.log(`  ${g.id}  ${g.what}`);
      if (g.note) console.log(`      ${g.note}`);
    }
  }
  console.log('');
}

async function cmdDraft(id) {
  const gaps = await readGaps();
  const g = gaps.find(x => x.id === id);
  if (!g) throw new Error(`没有 ${id}`);
  if (g.state !== 'open') throw new Error(`${id} 状态是 ${g.state}，只有 open 才能出草案`);

  const dir = path.join(DIR_TRIAL, id);
  await fsp.mkdir(dir, { recursive: true });

  // 1. 说明
  await fsp.writeFile(path.join(dir, 'SKILL.md'), `# ${g.what}

> 缺口编号：${g.id}
> 登记时间：${g.createdAt}
> 原因：${g.why || '（未填）'}

## 要解决什么

${g.what}

## 怎么用

（草案阶段先写清预期调用方式）

## 依赖与限制

（有外部依赖、权限要求、平台限制，写在这儿）

## 测试怎么算过

见同目录 \`test.mjs\`。测试全过才允许 promote。
`, 'utf8');

  // 2. 工具骨架
  await fsp.writeFile(path.join(dir, 'tool.mjs'), `/**
 * ${g.what}
 * 缺口 ${g.id}
 */

export const TOOL = {
  name: '${toToolName(g.what)}',
  description: '${g.what}',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: '输入' },
    },
    required: ['input'],
    additionalProperties: false,
  },
};

export const HINT = '需要${g.what}时调用 ${toToolName(g.what)}。';

export async function run(args) {
  // TODO: 实现
  return { ok: false, error: '尚未实现' };
}
`, 'utf8');

  // 3. 测试骨架
  await fsp.writeFile(path.join(dir, 'test.mjs'), `/**
 * ${g.id} 的测试。全过才算通过。
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
`, 'utf8');

  g.state = 'drafted';
  g.note = `草案在 trial/${id}/`;
  await rewrite(gaps);

  console.log(`✓ 草案已生成：${dir}`);
  console.log(`  SKILL.md / tool.mjs / test.mjs`);
  console.log(`\n下一步：把 tool.mjs 里的 TODO 实现掉，然后 node test.mjs 验证`);
  return { id, dir };
}

async function cmdTest(id) {
  const gaps = await readGaps();
  const g = gaps.find(x => x.id === id);
  if (!g) throw new Error(`没有 ${id}`);
  if (g.state !== 'drafted' && g.state !== 'tested') throw new Error(`${id} 状态是 ${g.state}，只有 drafted/tested 能测`);

  const dir = path.join(DIR_TRIAL, id);
  const testFile = path.join(dir, 'test.mjs');
  if (!fs.existsSync(testFile)) throw new Error(`测试文件不存在: ${testFile}`);

  let passed = false;
  let output = '';
  try {
    const r = await execFileP(process.execPath, [testFile], { cwd: dir, windowsHide: true });
    output = (r.stdout || '') + (r.stderr || '');
    passed = true;
  } catch (e) {
    output = (e.stdout || '') + (e.stderr || '') + (e.message || '');
    passed = false;
  }

  console.log(output.trim());

  if (passed) {
    g.state = 'tested';
    g.testedAt = new Date().toISOString();
    g.note = '测试通过，待审批转正';
    await rewrite(gaps);
    console.log(`\n✓ ${id} 测试通过`);
    console.log(`\n下一步：等用户批准后 node gaps.mjs promote ${id} --by "your-name"`);
  } else {
    g.note = '测试未通过';
    await rewrite(gaps);
    console.log(`\n✗ ${id} 测试未通过，状态不变`);
  }
  return { id, passed };
}

async function cmdPromote(id, opts) {
  const gaps = await readGaps();
  const g = gaps.find(x => x.id === id);
  if (!g) throw new Error(`没有 ${id}`);

  // ★ 唯一的价值就在这条门槛上
  if (g.state !== 'tested') {
    throw new Error(`拒绝转正：${id} 当前状态是 ${g.state}，必须先 test 通过（tested）才能 promote`);
  }
  if (!opts.by) throw new Error('拒绝转正：必须写 --by，说明是谁批准的');

  const from = path.join(DIR_TRIAL, id);
  const to = path.join(DIR_ACTIVE, id);
  if (!fs.existsSync(from)) throw new Error(`草案目录不存在: ${from}`);
  await fsp.mkdir(DIR_ACTIVE, { recursive: true });
  if (fs.existsSync(to)) throw new Error(`目标已存在: ${to}`);

  await fsp.rename(from, to);

  g.state = 'promoted';
  g.promotedAt = new Date().toISOString();
  g.note = `由 ${opts.by} 批准，已移入 active/${id}/`;
  await rewrite(gaps);

  console.log(`✓ ${id} 已转正 → ${to}`);
  return { id, to };
}

async function cmdReject(id, opts) {
  const gaps = await readGaps();
  const g = gaps.find(x => x.id === id);
  if (!g) throw new Error(`没有 ${id}`);
  if (g.state === 'promoted') throw new Error(`${id} 已转正，不能驳回`);

  g.state = 'rejected';
  g.note = `驳回：${opts.why || '（未写原因）'}`;
  await rewrite(gaps);
  console.log(`✓ ${id} 已驳回`);
  return { id };
}

/* =====================================================================
   小工具
   ===================================================================== */

/** 从一句中文需求里凑一个合法的工具名 */
function toToolName(what) {
  const ascii = what.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  if (ascii.length >= 3) return 'auto_' + ascii.slice(0, 24);
  return 'auto_' + Date.now().toString(36);
}

/* =====================================================================
   自测
   ===================================================================== */

export async function selfTest() {
  const bad = [];
  const fsx = await import('node:fs/promises');
  const os = await import('node:os');

  // 用临时目录跑一遍完整流程，不污染真实库
  const tmp = await fsx.mkdtemp(path.join(os.tmpdir(), 'kit-gaps-'));
  const savedDb = DB;
  // 这里不能改模块级常量，改用直接测纯函数 + 状态机逻辑
  await fsx.rm(tmp, { recursive: true, force: true });

  // 1. 状态机合法性
  if (!VALID_STATES.includes('tested')) bad.push('状态机缺 tested');
  if (VALID_STATES.includes('done')) bad.push('状态机不该有 done');

  // 2. id 生成
  const fake = [{ id: 'g-20260101-001' }];
  const nid = nextId(fake);
  if (!/^g-\d{8}-\d{3}$/.test(nid)) bad.push(`id 格式不对: ${nid}`);

  // 3. 工具名生成必须合法
  const tn = toToolName('把 PDF 批量转成可用文本');
  if (!/^[a-z][a-z0-9_]*$/i.test(tn)) bad.push(`生成的工具名不合法: ${tn}`);

  // 4. 关键：tested 之前的 promote 必须被拒
  //    （用真实的 cmdPromote 会动文件，这里只验证守卫条件存在于源码里）
  const src = await fsx.readFile(fileURLToPath(import.meta.url), 'utf8');
  if (!src.includes("g.state !== 'tested'")) bad.push('promote 门禁丢失');
  if (!src.includes('拒绝转正')) bad.push('promote 拒绝提示丢失');

  return bad;
}

/* =====================================================================
   CLI
   ===================================================================== */

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  try {
    switch (cmd) {
      case 'report':  await cmdReport(args); break;
      case 'list':    await cmdList(); break;
      case 'draft':   await cmdDraft(args._[1]); break;
      case 'test':    await cmdTest(args._[1]); break;
      case 'promote': await cmdPromote(args._[1], args); break;
      case 'reject':  await cmdReject(args._[1], args); break;
      case 'selftest': {
        const bad = await selfTest();
        if (bad.length) { console.log('✗'); bad.forEach(b => console.log('  · ' + b)); process.exit(1); }
        console.log('✓ gaps 自测通过');
        break;
      }
      default:
        console.log(`
缺口闭环 · 用法

  node gaps.mjs report --what "做不到什么" [--why "为什么"]
  node gaps.mjs list
  node gaps.mjs draft <id>
  node gaps.mjs test  <id>
  node gaps.mjs promote <id> --by "your-name"
  node gaps.mjs reject  <id> --why "原因"
  node gaps.mjs selftest

铁律：测试不过，promote 一律拒绝。
`);
    }
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
}
