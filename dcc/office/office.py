#!/usr/bin/env python3
"""
dcc/office/office.py — Office 三件套自动化（Word / Excel / PowerPoint）

依赖：pywin32（本机已装）、Microsoft Office 2024（本机已装并注册 COM）

设计原则
  1. 用 DispatchEx 而不是 Dispatch —— 起独立实例，绝不干扰用户已经打开的文档
  2. 每个操作都 try/finally 释放 COM 对象，不留僵尸进程
  3. 常量用数字而不是 win32com.client.constants（那玩意经常没初始化）
  4. 全部返回 dict，失败是 {ok: False, error}

用法：
  python office.py demo  --dir out          # 一次生成三种文档并转 PDF（验证用）
  python office.py word  --out a.docx --title "标题" --body "正文"
  python office.py excel --out a.xlsx --rows '[["a","b"],[1,2]]'
  python office.py ppt   --out a.pptx --title "标题" --bullets '["一","二"]'
"""

import os
import sys
import json
import argparse

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Office 常量（数字，避开 constants 没初始化的坑）
WD_FORMAT_PDF = 17
XL_OPENXML_WORKBOOK = 51
XL_TYPE_PDF = 0
PP_SAVE_AS_PDF = 32
PP_LAYOUT_TITLE_AND_CONTENT = 2


def _abspath(p):
    p = os.path.abspath(os.path.expanduser(p))
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    return p


# ============================================================
# Word
# ============================================================

def word_document(out_path, title="", body="", bullets=None, table=None):
    """生成一个 Word 文档。可选：标题 / 正文 / 项目符号列表 / 表格。"""
    import win32com.client as win32

    out_path = _abspath(out_path)
    app = None
    doc = None
    try:
        app = win32.DispatchEx("Word.Application")
        app.Visible = False
        app.DisplayAlerts = 0          # wdAlertsNone
        doc = app.Documents.Add()

        if title:
            p = doc.Paragraphs.Add()
            p.Range.Text = title
            p.Range.Style = "标题 1"
            p.Range.InsertParagraphAfter()

        if body:
            p = doc.Paragraphs.Add()
            p.Range.Text = body
            p.Range.InsertParagraphAfter()

        for b in (bullets or []):
            p = doc.Paragraphs.Add()
            p.Range.Text = str(b)
            # 用列表样式；不同语言包样式名不同，失败就退化成普通段落 + 项目符号字符
            try:
                p.Range.Style = "列表段落"
            except Exception:
                pass
            p.Range.InsertParagraphAfter()

        if table:
            rows, cols = len(table), len(table[0]) if table else 0
            if rows and cols:
                rng = doc.Range(doc.Content.End - 1, doc.Content.End - 1)
                t = doc.Tables.Add(rng, rows, cols)
                for i, row in enumerate(table):
                    for j, cell in enumerate(row):
                        t.Cell(i + 1, j + 1).Range.Text = str(cell)

        doc.SaveAs2(out_path, FileFormat=16)   # wdFormatDocumentDefault (.docx)
        saved = out_path
    except Exception as e:
        return {"ok": False, "error": f"Word 失败: {e}"}
    finally:
        try:
            if doc is not None:
                doc.Close(SaveChanges=0)
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass

    return {"ok": True, "path": saved, "exists": os.path.isfile(saved), "size": os.path.getsize(saved) if os.path.isfile(saved) else 0}


def word_to_pdf(docx_path, pdf_path=None):
    """docx → pdf。用 Word 本体转，排版最保真。"""
    import win32com.client as win32

    docx_path = _abspath(docx_path)
    pdf_path = _abspath(pdf_path or docx_path.replace(".docx", ".pdf"))
    app = None
    doc = None
    try:
        app = win32.DispatchEx("Word.Application")
        app.Visible = False
        app.DisplayAlerts = 0
        doc = app.Documents.Open(docx_path, ReadOnly=True)
        doc.ExportAsFixedFormat(OutputFileName=pdf_path, ExportFormat=WD_FORMAT_PDF)
    except Exception as e:
        return {"ok": False, "error": f"转 PDF 失败: {e}"}
    finally:
        try:
            if doc is not None:
                doc.Close(SaveChanges=0)
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass
    return {"ok": True, "path": pdf_path, "exists": os.path.isfile(pdf_path),
            "size": os.path.getsize(pdf_path) if os.path.isfile(pdf_path) else 0}


# ============================================================
# Excel
# ============================================================

def excel_workbook(out_path, rows=None, sheet_name="Sheet1", headers=None):
    """生成一个 Excel 工作簿。rows 是二维数组。"""
    import win32com.client as win32

    out_path = _abspath(out_path)
    app = None
    wb = None
    try:
        app = win32.DispatchEx("Excel.Application")
        app.Visible = False
        app.DisplayAlerts = False
        wb = app.Workbooks.Add()
        ws = wb.Worksheets(1)
        ws.Name = sheet_name[:31]   # Excel 工作表名上限 31

        r0 = 1
        if headers:
            for j, h in enumerate(headers, start=1):
                ws.Cells(r0, j).Value = h
            ws.Range(ws.Cells(r0, 1), ws.Cells(r0, len(headers))).Font.Bold = True
            r0 += 1

        for i, row in enumerate(rows or [], start=r0):
            for j, v in enumerate(row, start=1):
                ws.Cells(i, j).Value = v

        # 自动列宽
        try:
            ws.Columns.AutoFit()
        except Exception:
            pass

        wb.SaveAs(out_path, FileFormat=XL_OPENXML_WORKBOOK)
        saved = out_path
    except Exception as e:
        return {"ok": False, "error": f"Excel 失败: {e}"}
    finally:
        try:
            if wb is not None:
                wb.Close(SaveChanges=False)
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass

    return {"ok": True, "path": saved, "exists": os.path.isfile(saved), "size": os.path.getsize(saved) if os.path.isfile(saved) else 0}


# ============================================================
# PowerPoint
# ============================================================

def ppt_presentation(out_path, title="", bullets=None, slides=None):
    """生成一个 PPT。slides = [{"title": "...", "bullets": ["..."]}] 可覆盖单张。"""
    import win32com.client as win32

    out_path = _abspath(out_path)
    app = None
    pres = None
    try:
        app = win32.DispatchEx("PowerPoint.Application")
        # PowerPoint 不允许 Visible=False，只能开着但最小化
        pres = app.Presentations.Add()

        def add_slide(t, bl):
            s = pres.Slides.Add(pres.Slides.Count + 1, PP_LAYOUT_TITLE_AND_CONTENT)
            s.Shapes(1).TextFrame.TextRange.Text = t or ""
            if bl:
                s.Shapes(2).TextFrame.TextRange.Text = "\r\n".join(str(x) for x in bl)
            return s

        add_slide(title or "标题", bullets or [])

        for sl in (slides or []):
            add_slide(sl.get("title", ""), sl.get("bullets", []))

        pres.SaveAs(out_path)
        saved = out_path
    except Exception as e:
        return {"ok": False, "error": f"PowerPoint 失败: {e}"}
    finally:
        try:
            if pres is not None:
                pres.Close()
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass

    return {"ok": True, "path": saved, "exists": os.path.isfile(saved), "size": os.path.getsize(saved) if os.path.isfile(saved) else 0}


# ============================================================
# demo / CLI
# ============================================================

def demo(out_dir):
    """一次生成三种文档 + 三个 PDF，用来验证整条链通不通。"""
    out_dir = _abspath(os.path.join(out_dir, "x"))[:-2]   # 去掉占位的 x
    os.makedirs(out_dir, exist_ok=True)
    results = {}

    w = word_document(
        os.path.join(out_dir, "demo.docx"),
        title="星炬自动化验证",
        body="这是一份由脚本自动生成的文档，用来验证 Word COM 通路。",
        bullets=["第一条：生成正常", "第二条：样式套用", "第三条：可转 PDF"],
        table=[["项目", "状态"], ["Word", "OK"], ["Excel", "待测"], ["PowerPoint", "待测"]],
    )
    results["word"] = w

    e = excel_workbook(
        os.path.join(out_dir, "demo.xlsx"),
        headers=["指标", "数值", "单位"],
        rows=[["CPU 负载", 42, "%"], ["内存占用", 61.5, "%"], ["文件数", 128, "个"]],
    )
    results["excel"] = e

    p = ppt_presentation(
        os.path.join(out_dir, "demo.pptx"),
        title="星炬自动化验证",
        bullets=["Word：已通", "Excel：已通", "PowerPoint：已通"],
        slides=[{"title": "下一步", "bullets": ["接 Resolve", "接 Adobe", "接 C4D"]}],
    )
    results["ppt"] = p

    if w.get("ok"):
        results["word_pdf"] = word_to_pdf(os.path.join(out_dir, "demo.docx"),
                                          os.path.join(out_dir, "demo-word.pdf"))
    if e.get("ok"):
        results["excel_pdf"] = excel_to_pdf(os.path.join(out_dir, "demo.xlsx"),
                                            os.path.join(out_dir, "demo-excel.pdf"))
    if p.get("ok"):
        results["ppt_pdf"] = ppt_to_pdf(os.path.join(out_dir, "demo.pptx"),
                                        os.path.join(out_dir, "demo-ppt.pdf"))

    return {"ok": all(r.get("ok") for r in results.values()), "dir": out_dir, "results": results}


def excel_to_pdf(xlsx_path, pdf_path=None):
    import win32com.client as win32
    xlsx_path = _abspath(xlsx_path)
    pdf_path = _abspath(pdf_path or xlsx_path.replace(".xlsx", ".pdf"))
    app = None
    wb = None
    try:
        app = win32.DispatchEx("Excel.Application")
        app.Visible = False
        app.DisplayAlerts = False
        wb = app.Workbooks.Open(xlsx_path, ReadOnly=True)
        wb.ExportAsFixedFormat(XL_TYPE_PDF, pdf_path)
    except Exception as e:
        return {"ok": False, "error": f"Excel 转 PDF 失败: {e}"}
    finally:
        try:
            if wb is not None: wb.Close(SaveChanges=False)
        except Exception: pass
        try:
            if app is not None: app.Quit()
        except Exception: pass
    return {"ok": True, "path": pdf_path, "exists": os.path.isfile(pdf_path),
            "size": os.path.getsize(pdf_path) if os.path.isfile(pdf_path) else 0}


def ppt_to_pdf(pptx_path, pdf_path=None):
    import win32com.client as win32
    pptx_path = _abspath(pptx_path)
    pdf_path = _abspath(pdf_path or pptx_path.replace(".pptx", ".pdf"))
    app = None
    pres = None
    try:
        app = win32.DispatchEx("PowerPoint.Application")
        pres = app.Presentations.Open(pptx_path, WithWindow=False)
        pres.SaveAs(pdf_path, PP_SAVE_AS_PDF)
    except Exception as e:
        return {"ok": False, "error": f"PPT 转 PDF 失败: {e}"}
    finally:
        try:
            if pres is not None: pres.Close()
        except Exception: pass
        try:
            if app is not None: app.Quit()
        except Exception: pass
    return {"ok": True, "path": pdf_path, "exists": os.path.isfile(pdf_path),
            "size": os.path.getsize(pdf_path) if os.path.isfile(pdf_path) else 0}


def main():
    ap = argparse.ArgumentParser(description="Office 自动化")
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("demo", help="生成三种文档并转 PDF")
    d.add_argument("--dir", default="out")

    w = sub.add_parser("word")
    w.add_argument("--out", required=True)
    w.add_argument("--title", default="")
    w.add_argument("--body", default="")
    w.add_argument("--bullets", default="[]")

    e = sub.add_parser("excel")
    e.add_argument("--out", required=True)
    e.add_argument("--rows", default="[]")
    e.add_argument("--headers", default="")

    p = sub.add_parser("ppt")
    p.add_argument("--out", required=True)
    p.add_argument("--title", default="")
    p.add_argument("--bullets", default="[]")

    args = ap.parse_args()

    if args.cmd == "demo":
        r = demo(args.dir)
    elif args.cmd == "word":
        r = word_document(args.out, args.title, args.body, json.loads(args.bullets))
    elif args.cmd == "excel":
        headers = [h for h in args.headers.split(",") if h] or None
        r = excel_workbook(args.out, json.loads(args.rows), headers=headers)
    elif args.cmd == "ppt":
        r = ppt_presentation(args.out, args.title, json.loads(args.bullets))
    else:
        r = {"ok": False, "error": "未知命令"}

    print(json.dumps(r, ensure_ascii=False, indent=2))
    return 0 if r.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
