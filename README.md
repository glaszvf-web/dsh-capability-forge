# dsh-capability-forge

**想要什么能力，丢一个文件进去。**

写给另一类痛点：工具越加越多，主程序越改越乱。每加一个能力就动一次核心，最后没人敢碰那个文件。

这个套件把「加能力」和「改程序」拆开，顺手把「缺什么能力」也变成一条能走完的流水线。

---

## 它分三层

| 层 | 目录 | 干什么 |
|---|---|---|
| 扩展 | `providers/` | 一个 `.mjs` 文件就是一个工具，自动发现，不改主程序 |
| 闭环 | `gaps/` | 做不到的事记下来 → 起草 → 测试 → 转正，测试不过不放行 |
| 落地 | `dcc/` | 把能力伸进具体软件：Office、达芬奇、Adobe、C4D |

`tools/` 里放两件配套工具：可视化审计、从 profile 里安全摘包。

---

## 一、providers · 热插拔

目录下任何 `.mjs`（下划线开头的是内部文件，会跳过）都会被自动加载。

一个文件导出下面之一：

```js
// 单工具
export const TOOL = {
  name: 'sysinfo',
  description: '本机 CPU / 内存 / 运行时长',
  parameters: { type: 'object', properties: {} },
};
export async function run(args) { return { ok: true, ... }; }
```

```js
// 多工具
export function provide() {
  return [[TOOL_A, fnA], [TOOL_B, fnB]];
}
```

可选导出 `HINT`（字符串），会被收集起来追加到提示词里。

**自带的六个**：`sysinfo` 系统概况 · `dirstats` 目录体量分布 · `disk` 各盘余量 · `procs` 进程列表 · `portscan` 端口占用 · `recent` 最近改动。

**两条做过取舍的纪律**：

- 参数校验自己写，不引 ajv。只为几种常用类型多 200KB 依赖不值当。校验失败返回错误数组，不抛异常。
- 配置开关照 `{ "plugins": { "name": false } }`，关掉一个 provider 不用删文件。

---

## 二、gaps · 缺口闭环

```bash
node gaps/gaps.mjs report "把 PDF 批量转成可用文本" --why "每次都要手动做"
node gaps/gaps.mjs draft  g-20260101-001
node gaps/gaps.mjs test   g-20260101-001
node gaps/gaps.mjs promote g-20260101-001 --by "your-name"
```

状态机：`reported → drafting → tested → promoted`，旁支 `rejected`。

**整条流水线唯一的价值在这一条**：`promote` 必须测试通过。测试不过一律拒绝转正，没有例外、没有 `--force`。

为什么这么死：一个没测过的能力被转正，比没有这个能力更坏。它会被当成可用的东西去调用，然后在最不该失败的时候失败。

`_demo-archive/` 里留了一组被拒和通过的真实记录，可以看门禁长什么样。

---

## 三、dcc · 软件自动化

把能力从「读本机」伸到「操作软件」。

| 目标 | 通道 | 状态 |
|---|---|---|
| Office (Word/Excel/PPT) | COM via pywin32 | 已跑通完整链路，含 PDF 导出 |
| 达芬奇 (DaVinci Resolve) | Python 桥 | 代码就绪，待连测 |
| Adobe (After Effects / Photoshop) | ExtendScript `.jsx` | 代码就绪，待连测 |
| Cinema 4D | `c4dpy` | 卡在许可证交互，需先人工激活一次 |

**Office 那段的关键设计**：用 `DispatchEx` 起独立实例，绝不干扰用户已经打开的文档；每步 `try/finally` 释放 COM，不留僵尸进程。

C4D 那个坑记在 `dcc/c4d/README.md` 里 —— `c4dpy.exe` 任何参数（包括 `-c`、`-h`）都会先弹许可证菜单，无解，只能人工走一次。

---

## 快速开始

```bash
# 加载器自测
node test/smoke.mjs

# 看看有哪些工具
node -e "import('./providers/_registry.mjs').then(async m=>{
  const r=m.createRegistry(); const i=await r.loadAll('./providers');
  console.log(i, r.list().map(t=>t.name));
})"
```

零依赖，不需要 `npm install`。

---

## 来源说明

`providers` 的插件发现机制、`gaps` 的缺口流水线，**设计思路参考自 GDDXX-Jarvis（GPL-3.0）**。本包内代码为独立实现，未包含该项目的任何源码。

具体参考点：

- 加能力 = 加一个工具，不用改主程序
- 缺口 → 登记 → 批准 → 起草 → 测试 → 转正
- 平台差异收在采集层，上层不判断 OS

---

## 许可

MIT。

<p align="right"><sub>built by Aemeath</sub></p>
