/*
 * ae_probe.jsx — AE 探针
 *
 * 作用：把当前打开项目的合成列表、工程信息写到一个文本文件，验证 ExtendScript 通路。
 * 不修改任何工程内容，纯只读。
 *
 * 用法：
 *   & "C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\AfterFX.exe" -r "path\to\ae_probe.jsx"
 *
 * 输出：%TEMP%\ae_probe.txt
 *
 * 注意 ExtendScript 是 ES3：
 *   · 不能用 const / let / 箭头函数 / 模板字符串
 *   · 用 var 和 function
 */

(function () {
    var lines = [];
    function log(s) { lines.push(s); }

    try {
        log("=== AE 探针 ===");
        log("AE 版本: " + app.version);
        log("AE 语言: " + app.isoLanguage);
        log("时间: " + new Date().toString());
        log("");

        var proj = app.project;
        if (!proj) {
            log("没有打开任何项目（app.project 为 null）");
        } else {
            log("项目文件: " + proj.file);
            log("合成数: " + proj.numItems);

            var comps = [];
            for (var i = 1; i <= proj.numItems; i++) {
                var it = proj.item(i);
                if (it instanceof CompItem) {
                    comps.push({
                        index: i,
                        name: it.name,
                        width: it.width,
                        height: it.height,
                        duration: it.duration,
                        frameRate: it.frameRate,
                        layers: it.numLayers
                    });
                }
            }

            log("其中的合成：" + comps.length + " 个");
            for (var k = 0; k < comps.length; k++) {
                var c = comps[k];
                log("  [" + c.index + "] " + c.name +
                    "  " + c.width + "x" + c.height +
                    "  " + c.duration.toFixed(2) + "s" +
                    "  " + c.frameRate + "fps" +
                    "  " + c.layers + " 层");
            }
        }
    } catch (e) {
        log("错误: " + e.toString() + " (line " + e.line + ")");
    }

    // 写到临时目录
    var out = new File(Folder.temp.fsName + "/ae_probe.txt");
    out.encoding = "UTF-8";
    if (out.open("w")) {
        out.write(lines.join("\n"));
        out.close();
    }
})();
