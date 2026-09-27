(function () {
    "use strict";

    const CODE_128_PATTERNS = [
        "212222", "222122", "222221", "121223", "121322", "131222",
        "122213", "122312", "132212", "221213", "221312", "231212",
        "112232", "122132", "122231", "113222", "123122", "123221",
        "223211", "221132", "221231", "213212", "223112", "312131",
        "311222", "321122", "321221", "312212", "322112", "322211",
        "212123", "212321", "232121", "111323", "131123", "131321",
        "112313", "132113", "132311", "211313", "231113", "231311",
        "112133", "112331", "132131", "113123", "113321", "133121",
        "313121", "211331", "231131", "213113", "213311", "213131",
        "311123", "311321", "331121", "312113", "312311", "332111",
        "314111", "221411", "431111", "111224", "111422", "121124",
        "121421", "141122", "141221", "112214", "112412", "122114",
        "122411", "142112", "142211", "241211", "221114", "413111",
        "241112", "134111", "111242", "121142", "121241", "114212",
        "124112", "124211", "411212", "421112", "421211", "212141",
        "214121", "412121", "111143", "111341", "131141", "114113",
        "114311", "411113", "411311", "113141", "114131", "311141",
        "411131", "211412", "211214", "211232", "2331112"
    ];

    const START_CODE_B = 104;
    const STOP_CODE = 106;

    function encodeCode128B(value) {
        const text = String(value || "");

        if (!text || !/^[\x20-\x7e]+$/.test(text)) {
            throw new Error(
                "Code 128 labels require printable ASCII text."
            );
        }

        const values = [START_CODE_B];
        let checksum = START_CODE_B;

        for (let index = 0; index < text.length; index += 1) {
            const code = text.charCodeAt(index) - 32;

            values.push(code);
            checksum += code * (index + 1);
        }

        values.push(checksum % 103, STOP_CODE);

        return values;
    }

    function getPatternWidth(pattern) {
        return Array.from(pattern).reduce(
            (total, width) => total + Number(width),
            0
        );
    }

    function renderCode128Label(canvas, value, options) {
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error("A canvas element is required.");
        }

        const settings = Object.assign(
            {
                moduleWidth: 8,
                quietZoneModules: 12,
                topPadding: 48,
                barHeight: 280,
                textGap: 34,
                fontSize: 52,
                bottomPadding: 48
            },
            options || {}
        );

        const text = String(value || "").trim().toUpperCase();
        const codes = encodeCode128B(text);
        const patternWidth = codes.reduce(
            (total, code) =>
                total + getPatternWidth(CODE_128_PATTERNS[code]),
            0
        );
        const quietZone =
            settings.quietZoneModules * settings.moduleWidth;

        canvas.width =
            (patternWidth * settings.moduleWidth) +
            (quietZone * 2);
        canvas.height =
            settings.topPadding +
            settings.barHeight +
            settings.textGap +
            settings.fontSize +
            settings.bottomPadding;

        const context = canvas.getContext("2d");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = "#000000";

        let x = quietZone;

        for (const code of codes) {
            const pattern = CODE_128_PATTERNS[code];
            let drawBar = true;

            for (const width of pattern) {
                const pixelWidth =
                    Number(width) * settings.moduleWidth;

                if (drawBar) {
                    context.fillRect(
                        x,
                        settings.topPadding,
                        pixelWidth,
                        settings.barHeight
                    );
                }

                x += pixelWidth;
                drawBar = !drawBar;
            }
        }

        context.font =
            `700 ${settings.fontSize}px ui-monospace, ` +
            "SFMono-Regular, Consolas, monospace";
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(
            text,
            canvas.width / 2,
            settings.topPadding +
                settings.barHeight +
                settings.textGap
        );

        return canvas;
    }

    function createCode128LabelDataUrl(value, options) {
        const canvas = document.createElement("canvas");

        renderCode128Label(canvas, value, options);

        return canvas.toDataURL("image/png");
    }

    function downloadCode128Label(value, filename, options) {
        const link = document.createElement("a");

        link.href = createCode128LabelDataUrl(value, options);
        link.download = filename || `${value}-barcode.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function printCode128Label(value, options) {
        const printWindow = window.open("", "_blank");

        if (!printWindow) {
            throw new Error(
                "The print window was blocked. Allow pop-ups and try again."
            );
        }

        printWindow.opener = null;

        const imageUrl = createCode128LabelDataUrl(value, options);
        const settings = Object.assign(
            {
                title: String(value || "").trim().toUpperCase(),
                paper: "thermal",
                copies: 2,
                titleSize: 44,
                barcodeWidth: 68
            },
            options || {}
        );
        const safeTitle = String(value || "").replace(
            /[^A-Za-z0-9_-]/g,
            ""
        );

        printWindow.document.open();
        printWindow.document.write(
            "<!doctype html><html><head>" +
            `<title>${safeTitle} Label Preview</title>` +
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<style>" +
            ":root{--title-size:44pt;--barcode-width:68%}" +
            "*{box-sizing:border-box}" +
            "html,body{margin:0;min-height:100%;background:#e5e7eb;" +
            "color:#111827;font-family:Arial,sans-serif}" +
            ".toolbar{position:sticky;top:0;z-index:2;display:flex;" +
            "flex-wrap:wrap;align-items:end;gap:14px;padding:14px 18px;" +
            "background:#111827;color:#fff;box-shadow:0 2px 8px #0004}" +
            ".control{display:grid;gap:5px;min-width:150px}" +
            ".control label{font-size:12px;font-weight:700}" +
            ".control output{font-weight:400;color:#d1d5db}" +
            ".control select,.control input{width:100%}" +
            ".actions{display:flex;gap:8px;margin-left:auto}" +
            "button{min-height:40px;padding:8px 16px;border:1px solid #4b5563;" +
            "border-radius:6px;background:#fff;color:#111827;font-weight:700;" +
            "cursor:pointer}" +
            ".print-button{border-color:#facc15;background:#facc15}" +
            ".preview{display:grid;place-items:center;padding:24px}" +
            ".sheet{width:min(4in,calc(100vw - 48px));height:6in;" +
            "background:#fff;box-shadow:0 8px 30px #0003;overflow:hidden}" +
            ".sheet[data-paper=\"letter\"]{width:min(8.5in,calc(100vw - 48px));" +
            "height:11in}" +
            ".label{height:50%;display:flex;flex-direction:column;" +
            "align-items:center;justify-content:center;padding:.16in;" +
            "overflow:hidden}" +
            ".label:first-child{border-bottom:1px dashed #9ca3af}" +
            ".sheet[data-copies=\"1\"] .label{height:100%}" +
            ".sheet[data-copies=\"1\"] .label:first-child{border:0}" +
            ".sheet[data-copies=\"1\"] .copy-two{display:none}" +
            ".tote-title{max-width:100%;margin:0 0 .12in;overflow-wrap:anywhere;" +
            "font-size:var(--title-size);font-weight:900;line-height:.95;" +
            "letter-spacing:0;text-align:center}" +
            ".barcode{display:block;width:var(--barcode-width);max-width:100%;" +
            "height:auto;object-fit:contain}" +
            "@media(max-width:640px){.toolbar{align-items:stretch}.control{" +
            "min-width:calc(50% - 8px);flex:1}.actions{width:100%;" +
            "margin-left:0}.actions button{flex:1}.preview{padding:14px}.sheet{" +
            "width:min(4in,calc(100vw - 28px));height:auto;aspect-ratio:2/3}" +
            ".sheet[data-paper=\"letter\"]{width:calc(100vw - 28px);height:auto;" +
            "aspect-ratio:8.5/11}" +
            ".label{height:50%}.sheet[data-copies=\"1\"] .label{height:100%}}" +
            "@page{size:4in 6in;margin:0}" +
            "@media print{html,body{background:#fff}" +
            ".toolbar{display:none}.preview{display:block;padding:0}.sheet{" +
            "width:4in;height:6in;box-shadow:none}.label:first-child{" +
            "border-bottom:1px dashed #777}.sheet[data-paper=\"letter\"]{" +
            "width:8.5in;height:11in}}" +
            "</style></head><body>" +
            "<div class=\"toolbar\">" +
            "<div class=\"control\"><label for=\"paper\">Paper</label>" +
            "<select id=\"paper\"><option value=\"thermal\">4 x 6 Thermal</option>" +
            "<option value=\"letter\">US Letter (8.5 x 11)</option></select></div>" +
            "<div class=\"control\"><label for=\"copies\">Labels per sheet</label>" +
            "<select id=\"copies\"><option value=\"1\">1 label</option>" +
            "<option value=\"2\">2 labels</option></select></div>" +
            "<div class=\"control\"><label for=\"titleSize\">Tote name " +
            "<output id=\"titleSizeValue\"></output></label>" +
            "<input id=\"titleSize\" type=\"range\" min=\"24\" max=\"64\" step=\"2\"></div>" +
            "<div class=\"control\"><label for=\"barcodeWidth\">Barcode " +
            "<output id=\"barcodeWidthValue\"></output></label>" +
            "<input id=\"barcodeWidth\" type=\"range\" min=\"40\" max=\"96\" step=\"2\"></div>" +
            "<div class=\"actions\"><button id=\"closeButton\" type=\"button\">Close</button>" +
            "<button id=\"printButton\" class=\"print-button\" type=\"button\">Print</button></div>" +
            "</div><main class=\"preview\"><div id=\"sheet\" class=\"sheet\">" +
            "<section class=\"label\"><h1 class=\"tote-title\"></h1>" +
            "<img class=\"barcode\" alt=\"Tote barcode\"></section>" +
            "<section class=\"label copy-two\" aria-hidden=\"true\">" +
            "<h1 class=\"tote-title\"></h1>" +
            "<img class=\"barcode\" alt=\"\"></section>" +
            "</div></main></body></html>"
        );
        printWindow.document.close();

        const previewDocument = printWindow.document;
        const sheet = previewDocument.getElementById("sheet");
        const paperInput = previewDocument.getElementById("paper");
        const copiesInput = previewDocument.getElementById("copies");
        const titleSizeInput =
            previewDocument.getElementById("titleSize");
        const barcodeWidthInput =
            previewDocument.getElementById("barcodeWidth");
        const titleSizeValue =
            previewDocument.getElementById("titleSizeValue");
        const barcodeWidthValue =
            previewDocument.getElementById("barcodeWidthValue");

        previewDocument.querySelectorAll(".tote-title").forEach(
            (title) => {
                title.textContent = settings.title;
            }
        );
        previewDocument.querySelectorAll(".barcode").forEach(
            (image) => {
                image.src = imageUrl;
            }
        );

        paperInput.value = settings.paper === "letter"
            ? "letter"
            : "thermal";
        copiesInput.value = String(settings.copies === 1 ? 1 : 2);
        titleSizeInput.value = String(settings.titleSize);
        barcodeWidthInput.value = String(settings.barcodeWidth);

        function updatePreview() {
            const paper = paperInput.value === "letter"
                ? "letter"
                : "thermal";
            const copies = copiesInput.value === "1" ? "1" : "2";
            const titleSize = Math.max(
                24,
                Math.min(64, Number(titleSizeInput.value) || 44)
            );
            const barcodeWidth = Math.max(
                40,
                Math.min(96, Number(barcodeWidthInput.value) || 68)
            );

            sheet.dataset.paper = paper;
            sheet.dataset.copies = copies;
            previewDocument.querySelectorAll("style[data-page-size]")
                .forEach((style) => style.remove());

            const pageSizeStyle = previewDocument.createElement("style");

            pageSizeStyle.dataset.pageSize = "true";
            pageSizeStyle.textContent = paper === "letter"
                ? "@page{size:letter portrait;margin:0}"
                : "@page{size:4in 6in;margin:0}";
            previewDocument.head.appendChild(pageSizeStyle);
            previewDocument.documentElement.style.setProperty(
                "--title-size",
                `${titleSize}pt`
            );
            previewDocument.documentElement.style.setProperty(
                "--barcode-width",
                `${barcodeWidth}%`
            );
            titleSizeValue.textContent = `${titleSize} pt`;
            barcodeWidthValue.textContent = `${barcodeWidth}%`;
        }

        paperInput.addEventListener("change", updatePreview);
        copiesInput.addEventListener("change", updatePreview);
        titleSizeInput.addEventListener("input", updatePreview);
        barcodeWidthInput.addEventListener("input", updatePreview);
        previewDocument.getElementById("closeButton").addEventListener(
            "click",
            () => printWindow.close()
        );
        previewDocument.getElementById("printButton").addEventListener(
            "click",
            () => {
                printWindow.focus();
                printWindow.print();
            }
        );

        updatePreview();
        printWindow.focus();
    }

    window.DVD_BARCODES = Object.freeze({
        createCode128LabelDataUrl,
        downloadCode128Label,
        printCode128Label,
        renderCode128Label
    });
})();
