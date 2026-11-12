# Cinema 4D 2025 自动化

> 状态：🔴 **暂不可用 —— 卡在许可证交互**
> 记录时间：2026-11-09

---

## 目录里有什么（实测）

```
C:\Program Files\Maxon Cinema 4D 2025\
├── c4dpy.exe                         6 MB   ← C4D 自带 Python 解释器
├── Commandline.exe                   6 MB   ← 命令行渲染器
├── Cinema 4D Team Render Client.exe  6 MB   ← 分布式渲染客户端
├── Cinema 4D Team Render Server.exe  6 MB   ← 分布式渲染服务端
├── uninstall.exe
└── corelibs/ resource/ licenses/ help/ ...
```

**没有 `Cinema 4D.exe`** —— 主程序可能通过 Maxon App 启动，或者叫别的名字。

---

## 两个入口（理论上）

### c4dpy.exe — Python 解释器

```powershell
& "C:\Program Files\Maxon Cinema 4D 2025\c4dpy.exe" -c "import c4d; print(c4d.GetC4DVersion())"
```

理论上这是最好的入口：能直接 `import c4d`，用完整 API 建模型、改材质、跑渲染。

### Commandline.exe — 命令行渲染

```powershell
& "C:\Program Files\Maxon Cinema 4D 2025\Commandline.exe" -render "D:\proj\scene.c4d"
```

适合无头出图，不需要开界面。

---

## 为什么现在不能用

`c4dpy.exe` 任何参数（包括 `-c`、`-h`）都会先弹许可证菜单：

```
----
Enter the license method:
  1) Maxon App
  2) Maxon Account
  3) Maxon License Server
  4) RLM
  Q) Quit
```

**它等键盘输入，管道喂不进去。** 脚本里调会一直挂着。

实测两次，都是 120 秒超时进后台 job，最后手动 kill 掉进程。

---

## 解法（需要人工做一次）

1. 图形界面打开一次 Cinema 4D 2025
2. 走完 Maxon App 的许可流程（登录 / 激活）
3. 关掉
4. 再试 `c4dpy.exe -c "import c4d; print(c4d.GetC4DVersion())"`

如果第 4 步还问许可证，检查：

- `%APPDATA%\Maxon\` 下有没有许可证缓存
- Maxon App 是否在运行（它可能负责转发许可证）
- `C:\Program Files\Maxon Cinema 4D 2025\licenses\` 目录内容

---

## 别踩的坑

1. **不要在脚本里裸调 `c4dpy.exe`** —— 会挂进程，占满超时时间
2. **调用前先设超时**，并且准备好 `Stop-Process -Name c4dpy -Force`
3. **`Commandline.exe` 大概率也有相同的许可检查** —— 激活前别试
4. 检查残留进程：`Get-Process -Name c4dpy,Commandline`

---

## 激活之后要做的事

- [ ] `c4dpy.exe -c "import c4d; print(c4d.GetC4DVersion())"` 验证 Python 通
- [ ] 写一个建模型的最小脚本（立方体 + 材质 + 保存）
- [ ] 测 `Commandline.exe -render` 无头出图
- [ ] 把 C4D 接进 `dcc/` 的统一入口

---

## 替代方案（在 C4D 不可用期间）

三维需求可以先走 **Blender 5.2.3**（已完全打通，`blender_*` 工具齐全），
C4D 独有的功能（MoGraph、特定渲染器）等激活后再说。
