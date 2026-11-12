# gaps — 能力缺口闭环

> 流程参考自 gddxx-jarvis（GPL-3.0）的 `jarvis/skills.py` 与 `review.py`；本包代码为独立实现。
> 一句话：**做不到的事记下来，变成草案，测过才转正。**

---

## 为什么要有它

我有很多"这次先手写一段"的时刻 —— 手写 pwsh、临时拼个脚本、现场想个办法。
活儿干完了，但下次遇到同样的事，还得从头再来一遍。

这套东西就干一件事：**把那些一次性动作，变成可复用的能力。**
而且强制走一条流水线，不让半成品混进正式区。

---

## 五步流水线

```
① report   做不到什么 → 登记
② draft    出草案骨架（SKILL.md + tool.mjs + test.mjs）→ trial/
③ 实现     把 tool.mjs 里的 TODO 写掉
④ test     跑 test.mjs，全过 → 状态变 tested
⑤ promote  转正 → trial/ 移到 active/
```

**铁律：测试不过，promote 一律拒绝。** 这是整条流水线唯一的价值所在 ——
没有这道门，"自我进化"就是"自我糊弄"。

---

## 用法

```bash
node gaps.mjs report --what "统计一个目录下各类文件的数量和总体积" --why "每次都要手写 pwsh"
node gaps.mjs list
node gaps.mjs draft g-20261109-002
# （编辑 trial/g-20261109-002/tool.mjs，把 TODO 实现掉）
node gaps.mjs test   g-20261109-002
node gaps.mjs promote g-20261109-002 --by "your-name"
node gaps.mjs reject  g-20261109-003 --why "不值得做"
```

---

## 状态机

```
open ──draft──▶ drafted ──test(过)──▶ tested ──promote──▶ promoted
                    │
                    └──reject──▶ rejected ◀──reject── open
```

- `promote` 只接受 `tested`
- `promote` 必须带 `--by`（谁批的）
- 已 `promoted` 的不能 `reject`

---

## 目录

```
gaps/
├── gaps.jsonl          所有缺口（一行一条 JSON）
├── trial/<id>/         草案区（未转正）
├── active/<id>/        正式区（已转正）
└── gaps.mjs            CLI
```

草案区与正式区**物理隔离** —— 没转正的代码永远不会被当成"现成能力"用。

---

## 已经被它转正的

| id | 能力 | 状态 |
|---|---|---|
| `g-20261109-002` | `dir_stats` 统计目录文件数量与体积 | ✅ active |

---

## 自测

```bash
node gaps.mjs selftest
```

验证：状态机合法性、id 格式、工具名合法性、promote 门禁存在。

---

## ⚠️ 现在台账里的两条是演示数据，不是真缺口

`g-20261109-001`（驳回）和 `g-20261109-002`（转正）**内容完全相同**，登记时间只差 11 秒 ——
那是 2026-11-09 建这套流水线时，为了验证「驳回」和「转正」两条路都能走通，故意造的两份。

`dir_stats`（统计目录文件数和体积）现在也确实在 `active/` 里能加载，但**没有在用** ——
一行 pwsh 就能干的事，不值得占一个能力位。

**看到这张台账时请记得**：这两个「已完成」是演示，不代表这套机制真的被用过一次。
真要用的时候，第一条应该是从**真实卡壳**里长出来的。

（2026-11-11 盘身体检时补的这段说明。）
