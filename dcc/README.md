# dcc — DCC 软件自动化基座

> 批次③ 产出
> 目标：这台机器上装的视效 / 建模 / 办公软件，全部能被脚本驱动。
> **不开软件也能跑**才算自动化。

---

## 一句话总览

| 软件 | 驱动方式 | 状态 |
|---|---|---|
| **DaVinci Resolve 21.1** | Python API（官方） | 🟡 桥已搭好，环境验证通过，待 Resolve 运行时连测 |
| **Blender 5.2.3 LTS** | `blender -b -P script.py` | 🟢 已配好（`blender_*` 工具） |
| **Office 2024**（Word/Excel/PPT） | COM（pywin32） | 🟢 **已实测，三种文档 + 三种 PDF 全通** |
| **After Effects 2025** | ExtendScript + `aerender.exe` | 🟢 脚本模板就位，aerender 已验证存在 |
| **Premiere Pro 2025** | ExtendScript | 🟡 骨架，复杂剪辑建议走达芬奇 |
| **Photoshop 2026** | ExtendScript / COM | 🟢 批量模板就位 |
| **Cinema 4D 2025** | `c4dpy.exe` / `Commandline.exe` | 🔴 **卡在许可证交互，需先手动激活一次** |

---

## 目录

```
dcc/
├── resolve/          达芬奇 Python 桥
│   └── bridge.py     probe / info / projects / timeline
├── adobe/            AE / PR / PS
│   ├── ae_probe.jsx          AE 探针（只读）
│   ├── ps_batch_resize.jsx   PS 批量改尺寸
│   └── README.md             三种调用方式 + 7 条坑
├── c4d/              Cinema 4D
│   └── README.md             c4dpy / Commandline 用法与许可证问题
└── office/           Word / Excel / PowerPoint
    ├── office.py             生成 + 转 PDF
    └── out/                  demo 产物
```

---

## 已验证的能力

### Office（唯一跑通完整链路的）

```powershell
$py = "python"   # 任何装了 pywin32 的 Python 3.9+
& $py "dcc\office\office.py" demo --dir "dcc\office\out"
```

产出（实测）：
```
demo.docx      14 KB
demo.xlsx      9 KB
demo.pptx      38 KB
demo-word.pdf  48 KB   ← %PDF- 头校验通过
demo-excel.pdf 40 KB   ← %PDF- 头校验通过
demo-ppt.pdf   55 KB   ← %PDF- 头校验通过
```

**关键设计**：用 `DispatchEx` 起独立实例，绝不干扰用户已打开的文档；每步 `try/finally` 释放 COM，不留僵尸进程。

### 达芬奇环境探测

```powershell
& $py "dcc\resolve\bridge.py" probe
```

实测输出：
```json
{
  "ok": true,
  "scriptDir": "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting",
  "libRoot": "D:\DaVinci Resolve",
  "hasModule": true,
  "hasLib": true,
  "resolveRunning": false,
  "hint": "环境就绪，但 Resolve 没在运行 —— 先打开它"
}
```

**还差一步**：Resolve 运行时 + 偏好设置里 `External scripting using = Local`，然后 `bridge.py info` 就能读到项目。

---

## C4D 那个坑（记下来，别再踩）

`C:\Program Files\Maxon Cinema 4D 2025\` 下面没有 `Cinema 4D.exe`，但有：

- `c4dpy.exe` —— C4D 自带的 Python 解释器（**理论上最好的入口**）
- `Commandline.exe` —— 命令行渲染器

问题是 **`c4dpy.exe -c "..."` 会卡在许可证选择菜单**：

```
Enter the license method:
  1) Maxon App
  2) Maxon Account
  3) Maxon License Server
  4) RLM
  Q) Quit
```

它等键盘输入，脚本里调会一直挂着（试了两次，都是 120 秒超时进后台）。

**解法（需要人工做一次）**：图形界面打开一次 C4D → 走完 Maxon App 许可流程 → 之后 `c4dpy` 才肯无交互跑。

在那之前，C4D 这条路不通。**别硬试**，会挂进程。

---

## 下一步

- [ ] Resolve 开着的时候跑一次 `bridge.py info`
- [ ] 用真实 aep 工程测 `aerender.exe`
- [ ] PS COM 实测一次（比 ExtendScript 更稳）
- [ ] C4D 激活后再试 `c4dpy`
- [ ] 把这些封成统一的 `dcc` 命令入口（一个 CLI 调所有软件）

---

## 安全边界

- 所有批处理**输出到新目录**，源文件只读
- Office 用 `DispatchEx`（独立实例），不碰用户已开的文档
- 不自动关闭用户开着的软件
- 渲染类操作前先确认输出路径，避免覆盖
