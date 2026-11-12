// ae_smoke.jsx —— AE 链路冒烟测试 v2
// 修正：中文版 AE 的输出模板名不是 "PNG Sequence"，改成自动探测
(function () {
    var OUT = new Folder(Folder.temp.fsName + "/ae_smoke_out");
    if (!OUT.exists) OUT.create();
    var log = new File(OUT.fsName + "/ae_smoke.txt");
    log.encoding = "UTF-8";
    log.open("w");
    function say(s) { log.writeln(s); }

    try {
        say("AE 版本: " + app.version);

        app.newProject();
        var proj = app.project;
        var comp = proj.items.addComp("SMOKE_COMP", 1280, 720, 1, 2, 25);
        say("合成已建: " + comp.name);

        comp.layers.addSolid([0.02, 0.03, 0.06], "BG", 1280, 720, 1);
        var txt = comp.layers.addText("AEMEATH SMOKE TEST");
        var src = txt.property("Source Text");
        var td = src.value;
        td.fontSize = 64;
        td.fillColor = [1, 0.77, 0.42];
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        src.setValue(td);
        txt.property("Position").setValue([640, 360]);
        say("图层已加: BG + 文字");

        var rq = proj.renderQueue;
        rq.items.add(comp);
        var item = rq.item(1);
        var om = item.outputModule(1);
        om.file = new File(OUT.fsName + "/ae_smoke.png");

        // 自动找 PNG 模板
        var cands = ["PNG序列", "PNG 序列", "PNG Sequence", "PNG", "无损", "Lossless"];
        var applied = "";
        for (var i = 0; i < cands.length; i++) {
            try { om.applyTemplate(cands[i]); applied = cands[i]; break; } catch (e) {}
        }
        say("输出模板: " + (applied || "（默认，未套用）"));
        say("输出格式: " + om.file.fsName);

        rq.render();
        say("渲染状态: " + item.status);
        say("产物存在: " + (new File(OUT.fsName + "/ae_smoke.png")).exists);

        var projFile = new File(OUT.fsName + "/ae_smoke.aep");
        proj.save(projFile);
        say("项目已存: " + projFile.exists);

        say("RESULT=OK");
    } catch (e) {
        say("RESULT=FAIL");
        say("错误: " + e.toString());
        say("行号: " + e.line);
    }
    log.close();
})();
