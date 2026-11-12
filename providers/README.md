# providers — 加能力 = 丢一个文件

> 流程参考自 gddxx-jarvis（GPL-3.0）的 `jarvis/plugins/` 目录设计与 `docs/extend.md`；本包代码为独立实现。
> 一句话：**加能力 = 加一个工具，不用改主程序。**

---

## 怎么加

在 `kit/providers/` 下新建一个 `.mjs`，导出这三样：

```js
export const TOOL = {
  name: 'my_tool',                    // 字母数字下划线
  description: '这个工具干什么，什么时候该用',
  parameters: {                       // 标准 JSON Schema
    type: 'object',
    properties: { q: { type: 'string', description: '查询词' } },
    required: ['q'],
  },
};

export const HINT = '可选。会被收集起来追加到提示词，告诉模型什么时候该调这个工具。';

export async function run(args) {
  return { ok: true, result: '...' };   // 统一形状：ok 表示成功
}
```

或者一次挂多个工具：

```js
export function provide() {
  return [
    [TOOL_A, fnA],
    [TOOL_B, fnB],
  ];
}
```

**下划线开头的文件会被跳过**（`_registry.mjs`、`_schema.mjs` 是内部件）。

---

## 关闭某个 provider

在 `kit/providers/config.json` 写：

```json
{ "plugins": { "sysinfo": false } }
```

---

## 三条纪律（照抄 jarvis 的，很好用）

1. **返回统一形状**：`{ ok, ... }`。调用方不用猜。
2. **说状态之前必须先调工具查** —— 不许嘴上说「CPU 很闲」而不查。
3. **会动到真实世界的操作不要做成 voice 工具** —— 对应到我这儿：这层只放**只读**和**可回溯**的东西。真要写文件、发消息、删东西，走正式工具链，别塞进 provider。

---

## 现有 provider

| 文件 | 工具名 | 干什么 |
|---|---|---|
| `sysinfo.mjs` | `sysinfo` | 本机 CPU / 内存 / 运行时长 / 时间 |

---

## 自测

```bash
node test\smoke.mjs
```

会临时造几个 provider（合法/非法/多工具/被禁用）跑一遍加载、校验、调用。
