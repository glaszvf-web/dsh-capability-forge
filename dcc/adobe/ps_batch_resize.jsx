/*
 * ps_batch_resize.jsx — PS 批量改尺寸 + 存 JPG
 *
 * 用法：改下面 CONFIG，然后
 *   & "C:\Program Files\Adobe\Adobe Photoshop 2026\Photoshop.exe" "path\to\ps_batch_resize.jsx"
 *
 * 注意：这是会动文件的脚本。默认只处理 CONFIG.srcDir 里的文件，
 *       原文件不动，输出到 CONFIG.outDir。
 */

var CONFIG = {
    srcDir: "D:/in",          // 源目录
    outDir: "D:/out",         // 输出目录（自动建）
    maxWidth: 1920,           // 长边上限
    jpgQuality: 9             // 0-12，12 最高
};

(function () {
    var src = new Folder(CONFIG.srcDir);
    if (!src.exists) {
        alert("源目录不存在: " + CONFIG.srcDir);
        return;
    }

    var out = new Folder(CONFIG.outDir);
    if (!out.exists) out.create();

    // 只处理常见位图
    var exts = ["png", "jpg", "jpeg", "psd", "tif", "tiff", "bmp"];
    var files = src.getFiles(function (f) {
        if (!(f instanceof File)) return false;
        var e = f.name.split(".").pop().toLowerCase();
        for (var i = 0; i < exts.length; i++) if (exts[i] === e) return true;
        return false;
    });

    if (!files.length) { alert("没有可处理的文件"); return; }

    var oldUnit = app.preferences.rulerUnits;
    var oldDialogs = app.displayDialogs;
    app.preferences.rulerUnits = Units.PIXELS;
    app.displayDialogs = DialogModes.NO;

    var log = [];
    var done = 0, failed = 0;

    for (var n = 0; n < files.length; n++) {
        var f = files[n];
        try {
            var doc = app.open(f);

            // 长边缩到 maxWidth 以内（小图不放大）
            var w = doc.width.as("px"), h = doc.height.as("px");
            var longSide = Math.max(w, h);
            var scale = Math.min(1, CONFIG.maxWidth / longSide);

            if (scale < 1) {
                doc.resizeImage(
                    UnitValue(w * scale, "px"),
                    UnitValue(h * scale, "px"),
                    72,
                    ResampleMethod.BICUBICSHARPER
                );
            }

            // 存 JPG
            var base = f.name.replace(/\.[^.]+$/, "");
            var jpg = new JPEGSaveOptions();
            jpg.quality = CONFIG.jpgQuality;
            jpg.embedColorProfile = true;
            doc.saveAs(new File(out.fsName + "/" + base + ".jpg"), jpg, true, Extension.LOWERCASE);

            // 不改原文件，直接关掉不保存
            doc.close(SaveOptions.DONOTSAVECHANGES);
            log.push("OK   " + f.name + "  " + w + "x" + h + " -> " + Math.round(w * scale) + "x" + Math.round(h * scale));
            done++;
        } catch (e) {
            log.push("FAIL " + f.name + "  " + e.toString());
            failed++;
        }
    }

    app.preferences.rulerUnits = oldUnit;
    app.displayDialogs = oldDialogs;

    // 写日志
    var logFile = new File(out.fsName + "/_batch_log.txt");
    logFile.encoding = "UTF-8";
    if (logFile.open("w")) {
        logFile.write("成功 " + done + " / 失败 " + failed + "\n\n" + log.join("\n"));
        logFile.close();
    }

    alert("批处理完成：成功 " + done + "，失败 " + failed + "\n日志在 " + out.fsName + "/_batch_log.txt");
})();
