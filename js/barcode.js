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
        const safeTitle = String(value || "").replace(
            /[^A-Za-z0-9_-]/g,
            ""
        );

        printWindow.document.open();
        printWindow.document.write(
            "<!doctype html><html><head>" +
            `<title>${safeTitle} Label</title>` +
            "<style>" +
            "@page{margin:0.25in}" +
            "html,body{margin:0;background:#fff}" +
            "body{display:flex;align-items:flex-start;" +
            "justify-content:center;padding:0.15in}" +
            "img{display:block;max-width:100%;height:auto}" +
            "</style></head><body>" +
            `<img src="${imageUrl}" alt="${safeTitle} barcode">` +
            "</body></html>"
        );
        printWindow.document.close();

        const image = printWindow.document.querySelector("img");
        const invokePrint = () => {
            printWindow.focus();
            printWindow.print();
        };

        if (image && image.complete) {
            window.setTimeout(invokePrint, 50);
        }
        else if (image) {
            image.addEventListener("load", invokePrint, {
                once: true
            });
        }
    }

    window.DVD_BARCODES = Object.freeze({
        createCode128LabelDataUrl,
        downloadCode128Label,
        printCode128Label,
        renderCode128Label
    });
})();
