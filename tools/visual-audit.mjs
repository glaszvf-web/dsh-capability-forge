#!/usr/bin/env node
/**
 * visual-audit.mjs — 可视化产物自动审计
 *
 * 解决的问题：审美靠自觉不可靠。这个脚本客观检查一个可视化文件
 * 有没有那六样「好看必需」的特征，缺哪样就扣分。
 *
 * 用法：
 *   node visual-audit.mjs <html文件>
 *   node visual-audit.mjs path\to\page.html
 *
 * 通过线：75 分。低于 75 一律打回。
 *
 * 说明：这只查代码特征，能拦住明显的 low，判断不了「好不好看」。
 * 真正的上限靠看别人的作品，这里的下限靠脚本卡。
 */

import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('用法: node visual-audit.mjs <html文件>');
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error('文件不存在: ' + file);
  process.exit(2);
}

const src = fs.readFileSync(file, 'utf8');
const kb = (src.length / 1024).toFixed(1);

/* ============================================================
   六个维度，每个维度若干个可检测的特征
   ============================================================ */

const CHECKS = [
  {
    id: 'space',
    name: '3D 空间感',
    weight: 20,
    hint: '平面 = low。要有透视、倾斜、近大远小',
    tests: [
      { re: /perspective|persp\b|1000\s*\/\s*\(1000/i, desc: '透视投影' },
      { re: /TILT|tilt|rotateX|rotate3d|transform.*rotate/i, desc: '盘面/视角倾斜' },
      { re: /depth|near|far\s*=|cos\(.*\)\s*\*\s*R/i, desc: '深度计算' },
    ],
  },
  {
    id: 'particle',
    name: '粒子 / 点云',
    weight: 22,
    hint: '没有粒子的画面是死的',
    tests: [
      { re: /particles?\s*[:=]\s*\[|particles\.push|forEach\(.*p\s*=>/i, desc: '粒子数组' },
      { re: /Math\.random\(\).*\n.*Math\.random\(\)/i, desc: '随机散布' },
      { re: /for\s*\(\s*(const|let|var)\s+\w+\s+of\s+\w*particles/i, desc: '遍历粒子' },
      { re: /beginPath\(\)[\s\S]{0,200}arc\(/i, desc: '画圆点' },
    ],
  },
  {
    id: 'glow',
    name: '辉光 / 光晕',
    weight: 18,
    hint: '点在暗处自发光，不是整块面板亮',
    tests: [
      { re: /createRadialGradient/i, desc: '径向渐变（光晕）' },
      { re: /globalCompositeOperation\s*=\s*['"]lighter['"]/i, desc: '叠加混合' },
      { re: /shadowBlur\s*=/i, desc: '阴影模糊' },
      { re: /bloom|Bloom|UnrealBloom/i, desc: '辉光后处理' },
    ],
  },
  {
    id: 'motion',
    name: '动效',
    weight: 15,
    hint: '慢速旋转、呼吸、拖尾。快速闪烁不算',
    tests: [
      { re: /requestAnimationFrame/i, desc: '动画循环' },
      { re: /Math\.sin\(/i, desc: '呼吸/波形' },
      { re: /rot\w*\s*\+=\s*dt|angle\s*\+=\s*dt|t\s*\+=\s*dt/i, desc: '随时间推进' },
      { re: /Math\.min\(0\.0[0-9]|dt\s*\*\s*0\.0\d/i, desc: '慢速（有 dt 限幅）' },
    ],
  },
  {
    id: 'structure',
    name: '结构感',
    weight: 13,
    hint: '圆、环、刻度、网格，让它像仪器',
    tests: [
      { re: /arc\(.*Math\.PI\s*\*\s*2/i, desc: '整圆/环' },
      { re: /ticks?|tick\b|刻度/i, desc: '刻度' },
      { re: /setLineDash/i, desc: '虚线' },
      { re: /grid|网格|linear-gradient\(rgba\([^)]*\)\s*1px/i, desc: '网格' },
    ],
  },
  {
    id: 'detail',
    name: '细节',
    weight: 12,
    hint: '角标、坐标、暗角 —— 占不到 5% 代码，质感差一半',
    tests: [
      { re: /corner|angle-mark|角标/i, desc: '角标' },
      { re: /vignette|vig\b|暗角|radial-gradient.*transparent.*#0/i, desc: '暗角' },
      { re: /coords|NODE|坐标/i, desc: '坐标文本' },
    ],
  },
];

/* ============================================================
   反模式检测（命中就扣分）
   ============================================================ */

const ANTI = [
  { re: /<table[\s>][\s\S]{0,2000}<\/table>/i, desc: '用了 HTML 表格做布局', penalty: 12 },
  { re: /border-radius:\s*4px;[^}]*box-shadow:\s*0\s+1px\s+3px\s+rgba\(0,\s*0,\s*0,\s*0?\.1\)/i, desc: '通用卡片阴影（Bootstrap 味）', penalty: 10 },
  { re: /background:\s*#fff;|background:\s*white/i, desc: '白色背景', penalty: 15 },
  { re: /font-family:\s*(Arial|Helvetica|sans-serif)\s*;/i, desc: '默认字体栈', penalty: 8 },
  { re: /\.card\s*\{[^}]*border:\s*1px solid #e/i, desc: '浅色边框卡片', penalty: 10 },
];

/* ============================================================
   跑
   ============================================================ */

const results = [];
let total = 0;
let maxTotal = 0;

for (const c of CHECKS) {
  const hits = [];
  for (const t of c.tests) {
    if (t.re.test(src)) hits.push(t.desc);
  }
  const ratio = hits.length / c.tests.length;
  const score = Math.round(c.weight * ratio);
  total += score;
  maxTotal += c.weight;
  results.push({ ...c, hits, score, ratio });
}

const antiHits = [];
let penalty = 0;
for (const a of ANTI) {
  if (a.re.test(src)) {
    antiHits.push(a.desc);
    penalty += a.penalty;
  }
}

const finalScore = Math.max(0, total - penalty);
const pass = finalScore >= 75;

/* ============================================================
   输出
   ============================================================ */

const line = (s) => console.log(s);
line('');
line('════════════════════════════════════════════');
line('  可视化审计 · ' + path.basename(file));
line('  ' + kb + ' KB');
line('════════════════════════════════════════════');
line('');

for (const r of results) {
  const bar = '█'.repeat(Math.round(r.ratio * 10)) + '░'.repeat(10 - Math.round(r.ratio * 10));
  const mark = r.ratio >= 0.6 ? 'OK  ' : r.ratio >= 0.3 ? '偏弱' : '缺失';
  line(`  ${mark}  ${r.name.padEnd(10)} ${bar}  ${r.score}/${r.weight}`);
  if (r.hits.length) {
    line('        ' + r.hits.join(' · '));
  } else {
    line('        ✗ 一个特征都没有 —— ' + r.hint);
  }
}

if (antiHits.length) {
  line('');
  line('  ⚠ 反模式：');
  for (const a of antiHits) line('      - ' + a);
  line(`      扣 ${penalty} 分`);
}

line('');
line('────────────────────────────────────────────');
line(`  基础分 ${total} / ${maxTotal}   扣分 ${penalty}`);

if (pass) {
  line(`  ✓ 最终 ${finalScore} —— 过线（75）`);
} else {
  line(`  ✗ 最终 ${finalScore} —— 不合格（需 ≥75）`);
  line('');
  line('  这份东西会显得 low。缺的维度：');
  for (const r of results) {
    if (r.ratio < 0.6) line('      · ' + r.name + ' —— ' + r.hint);
  }
}
/* ---- 输入侧检查：最近有没有看别人的作品 ---- */
/* 日志路径可配置，默认落在当前目录；没有日志文件时这项检查自动跳过 */
const LOG = process.env.VISUAL_AUDIT_LOG || '.visual-audit-log.json';
let lookOk = false, lookDays = null;
try {
  const raw = fs.readFileSync(LOG, 'utf8');
  const log = JSON.parse(raw);
  if (Array.isArray(log) && log.length) {
    const last = new Date(log[log.length - 1].date).getTime();
    lookDays = Math.floor((Date.now() - last) / 86400000);
    lookOk = lookDays <= 7;
  }
} catch (e) { /* 没有记录 */ }

line('────────────────────────────────────────────');
line('');
if (lookOk) {
  line(`  输入侧：${lookDays} 天前看过参考作品 ✓`);
} else if (lookDays === null) {
  line('  ⚠ 输入侧：从没记录过「看参考作品」');
  line('     做可视化前先看三个别人的作品，记到');
  line('     knowledge/visual-refs/look-log.json');
} else {
  line(`  ⚠ 输入侧：已经 ${lookDays} 天没看参考作品了`);
}
line('────────────────────────────────────────────');
line('');

process.exit(pass ? 0 : 1);
