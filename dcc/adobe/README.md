# Adobe 自动化 · ExtendScript + aerender

> AE 2025 / PR 2025 / PS 2026，全在 E 盘。
> ExtendScript 是 ES3 风格的 JS，比现代 JS 残，但够用。

---

## 路径

| 程序 | 路径 |
|---|---|
| After Effects | `C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\AfterFX.exe` |
| **aerender（无头渲染）** | `C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\aerender.exe` |
| Premiere Pro | `C:\Program Files\Adobe\Adobe Premiere Pro 2025\Adobe Premiere Pro.exe` |
| Photoshop | `C:\Program Files\Adobe\Adobe Photoshop 2026\Photoshop.exe` |

---

## 三种调用方式

### ① AE 执行脚本（会开 GUI）

```powershell
& "C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\AfterFX.exe" -r "path\to\script.jsx"
```

加 `-noui` 试试无界面（部分版本仍会闪一下窗口）。

### ② AE 无头渲染（推荐，最稳）

`aerender.exe` 是 AE 自带的命令行渲染器，不开主界面：

```powershell
# 用工程里已有的渲染队列
& "C:\Program Files\Adobe\Adobe After Effects 2025\...\aerender.exe" -project "D:\proj\a.aep" -comp "主合成" -output "D:\out\a.mov"

# 从指定帧到指定帧
& "C:\Program Files\Adobe\Adobe After Effects 2025\...\aerender.exe" -project a.aep -comp "主合成" -s 0 -e 120 -output out.mov

# 多进程渲染（多核跑同一工程的不同帧段）
& aerender.exe -project a.aep -comp "主合成" -mp
```

**这条路最适合批量出片**：先让 AE 把工程和合成建好（用脚本），再用 aerender 无头渲。

### ③ PS 批处理

三种接口都能用：
```powershell
# A. 命令行
& "C:\Program Files\Adobe\Adobe Photoshop 2026\Photoshop.exe" "path\script.jsx"

# B. COM（PowerShell）
$ps = New-Object -ComObject Photoshop.Application
$ps.Open("D:\in\a.psd")

# C. COM（Python + pywin32）
import win32com.client
ps = win32com.client.Dispatch("Photoshop.Application")
doc = ps.Open(r"D:\in\a.psd")
ps.SaveDocumentAs(...)
```

**PS 的 COM 是最成熟的**，批处理图优先走它。

---

## ExtendScript 模板

### AE：遍历合成、读出信息、写日志

见 `ae_probe.jsx`。用法：
```powershell
& "...\AfterFX.exe" -r "path\to\ae_probe.jsx"
```
会把当前项目的合成列表写进 `%TEMP%\ae_probe.txt`。

### PR：导出序列

见 `pr_export.jsx`（骨架）。PR 的 ExtendScript 覆盖面弱，复杂剪辑建议走达芬奇。

### PS：批量改尺寸 + 存 JPG

见 `ps_batch_resize.jsx`。

---

## 踩过的坑

1. **ExtendScript 没有 `const`/`let`/箭头函数** —— 用 `var` 和 `function`，否则脚本静默失败。
2. **路径要用 `File()` 对象**，字符串拼接容易在中文路径上挂。
3. **`app.project` 可能为 null**（AE 没开项目），所有操作前先判。
4. **AE 的 `-r` 执行完不会自动退出** —— 要用 `app.quit()` 或外部 kill。
5. **`-noui` 不是所有版本都支持** —— 检测不到就退化成普通 `-r`。
6. **PR 启动很慢**（30 秒+），批处理要给它足够等待时间。
7. **PS 的 COM 用 `Dispatch` 而不是 `DispatchEx`** —— PS 是单实例的，多开会打架。

---

## 状态

| 通路 | 状态 |
|---|---|
| AE 脚本模板 | ✅ 已写 |
| aerender 命令 | ✅ 已验证 exe 存在，未跑真实工程 |
| PR 脚本模板 | ✅ 骨架 |
| PS 脚本模板 | ✅ 已写 |
| PS COM | ⏳ 未实测 |
| AE 实际无头渲染 | ⏳ 需要真实工程才能测 |
