#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bridge.py — DaVinci Resolve 脚本桥

踩过的坑（2026-11-10 全解决了）：
  1. fusionscript.dll 在 Resolve 安装目录（不是 ProgramData/Scripting/Modules）
  2. Python 3.8+ 不再自动搜 DLL 路径，必须 os.add_dll_directory(<Resolve 目录>)
     —— 不做这步会报 "DLL load failed while importing fusionscript: 找不到指定的模块"
  3. 本机 Python 3.14 / 3.15 也能连（不一定要 3.12）
  4. 必须先启动 Resolve，且偏好设置里「外部脚本使用」= 本地（英文版是 Local）
  5. 改了那个开关要重启一次 Resolve 才生效

用法：
  python bridge.py info                    # 连接状态 + 版本
  python bridge.py projects                # 项目列表
  python bridge.py timeline                # 当前时间线概览
  python bridge.py probe                   # 全量探测
  python bridge.py doctor                  # 环境体检（不连接）
"""

import os
import sys
import json
import glob

# Windows 控制台默认 GBK，印中文会崩
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ============================================================
# 环境探测
# ============================================================

API_CANDIDATES = [
    r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting",
    r"C:\Program Files\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting",
]

RESOLVE_DIRS = [
    # 装到非标准位置的话，把你的路径加进这个列表
    r"C:\Program Files\Blackmagic Design\DaVinci Resolve",
    r"D:\DaVinci Resolve",
]


def find_api_dir():
    for p in API_CANDIDATES:
        if os.path.isdir(os.path.join(p, "Modules")):
            return p
    return None


def find_resolve_dir():
    """找 fusionscript.dll 所在目录"""
    for d in RESOLVE_DIRS:
        if os.path.isfile(os.path.join(d, "fusionscript.dll")):
            return d
    # 兜底：从 Resolve.exe 进程路径推
    return None


def setup_env():
    """配好环境，返回 (api_dir, resolve_dir, 错误)"""
    api = find_api_dir()
    if not api:
        cands = "\n  ".join(API_CANDIDATES)
        return None, None, "找不到 Scripting API 目录（Resolve 可能没装）\n\n候选路径：\n  " + cands

    rd = find_resolve_dir()
    if not rd:
        cands = "\n  ".join(RESOLVE_DIRS)
        return api, None, "找不到 fusionscript.dll\n\n候选目录：\n  " + cands

    os.environ["RESOLVE_SCRIPT_API"] = api
    os.environ["RESOLVE_SCRIPT_LIB"] = os.path.join(rd, "fusionscript.dll")

    mod_path = os.path.join(api, "Modules")
    if mod_path not in sys.path:
        sys.path.append(mod_path)

    # ★ 关键：Python 3.8+ 不会自动搜 DLL 依赖
    if sys.platform == "win32":
        try:
            os.add_dll_directory(rd)
        except Exception as e:
            return api, rd, f"add_dll_directory 失败: {e}"

    return api, rd, None


def connect():
    api, rd, err = setup_env()
    if err:
        return None, err
    try:
        import DaVinciResolveScript as dvr
    except Exception as e:
        return None, f"导入 DaVinciResolveScript 失败: {type(e).__name__}: {e}"
    try:
        r = dvr.scriptapp("Resolve")
    except Exception as e:
        return None, f"scriptapp 失败: {e}"
    if not r:
        return None, (
            "拿不到 Resolve 实例。检查三件事：\n"
            "  1. Resolve 是否正在运行\n"
            "  2. 偏好设置 → 系统 → 常规 → 外部脚本使用 = 本地(Local)\n"
            "  3. 改完那个开关之后有没有重启过 Resolve"
        )
    return r, None


def out(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


# ============================================================
# 命令
# ============================================================

def cmd_doctor():
    api = find_api_dir()
    rd = find_resolve_dir()
    info = {
        "python": sys.version.split()[0],
        "scripting_api": api or "未找到",
        "resolve_dir": rd or "未找到",
        "fusionscript": os.path.join(rd, "fusionscript.dll") if rd else "未找到",
        "resolve_running": False,
    }
    # 看进程（不依赖 psutil）
    try:
        import subprocess
        o = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Resolve.exe"],
            capture_output=True, text=True, timeout=10
        ).stdout
        info["resolve_running"] = "Resolve.exe" in o
    except Exception:
        pass

    ready = bool(api and rd and info["resolve_running"])
    info["ready"] = ready
    if not ready:
        missing = []
        if not api: missing.append("Scripting API 目录")
        if not rd: missing.append("fusionscript.dll")
        if not info["resolve_running"]: missing.append("Resolve 没在运行")
        info["missing"] = missing
    out(info)
    return 0 if ready else 1


def cmd_info():
    r, err = connect()
    if err:
        out({"ok": False, "error": err})
        return 1
    ip = r.GetProjectManager().GetCurrentProject()
    out({
        "ok": True,
        "version": r.GetVersionString(),
        "product": r.GetProductName() if hasattr(r, "GetProductName") else None,
        "current_project": ip.GetName() if ip else None,
        "python": sys.version.split()[0],
        "resolve_dir": find_resolve_dir(),
    })
    return 0


def cmd_projects():
    r, err = connect()
    if err:
        out({"ok": False, "error": err})
        return 1
    pm = r.GetProjectManager()
    cur = pm.GetCurrentProject()
    items = pm.GetProjectListInCurrentFolder() or []
    out({
        "ok": True,
        "current": cur.GetName() if cur else None,
        "count": len(items),
        "projects": items,
    })
    return 0


def cmd_timeline():
    r, err = connect()
    if err:
        out({"ok": False, "error": err})
        return 1
    pm = r.GetProjectManager()
    proj = pm.GetCurrentProject()
    if not proj:
        out({"ok": False, "error": "没有打开的项目"})
        return 1
    tl = proj.GetCurrentTimeline()
    if not tl:
        out({"ok": False, "error": "没有打开的时间线"})
        return 1

    info = {
        "ok": True,
        "project": proj.GetName(),
        "timeline": tl.GetName(),
        "fps": tl.GetSetting("timelineFrameRate") if hasattr(tl, "GetSetting") else None,
        "start_frame": tl.GetStartFrame(),
        "end_frame": tl.GetEndFrame(),
        "tracks": {
            "video": tl.GetTrackCount("video"),
            "audio": tl.GetTrackCount("audio"),
            "subtitle": tl.GetTrackCount("subtitle"),
        },
    }
    dur = tl.GetEndFrame() - tl.GetStartFrame()
    info["duration_frames"] = dur
    try:
        fps = float(info["fps"] or 24)
        info["duration_seconds"] = round(dur / fps, 2)
    except Exception:
        pass
    out(info)
    return 0


def cmd_probe():
    r, err = connect()
    if err:
        out({"ok": False, "error": err})
        return 1
    pm = r.GetProjectManager()
    proj = pm.GetCurrentProject()
    result = {
        "ok": True,
        "version": r.GetVersionString(),
        "current_project": proj.GetName() if proj else None,
        "projects": pm.GetProjectListInCurrentFolder() or [],
        "capabilities": {
            "project_manager": True,
            "media_storage": bool(proj.GetMediaStorage()) if proj else False,
            "timeline": bool(proj.GetCurrentTimeline()) if proj else False,
        },
    }
    out(result)
    return 0


COMMANDS = {
    "info": cmd_info,
    "projects": cmd_projects,
    "timeline": cmd_timeline,
    "probe": cmd_probe,
    "doctor": cmd_doctor,
}


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "info"
    fn = COMMANDS.get(cmd)
    if not fn:
        print(f"未知命令: {cmd}")
        print("可用: " + " / ".join(COMMANDS.keys()))
        return 2
    return fn()


if __name__ == "__main__":
    sys.exit(main())
