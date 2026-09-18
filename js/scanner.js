(function () {
    "use strict";

    const dialog = document.getElementById("barcodeScannerDialog");
    const video = document.getElementById("scannerVideo");
    const title = document.getElementById("scannerTitle");
    const status = document.getElementById("scannerStatus");
    const closeButton = document.getElementById("closeScannerButton");
    const preview = video.closest(".scanner-preview");
    const guide = document.querySelector(".scanner-guide");
    const cameraRow = document.getElementById("scannerCameraRow");
    const cameraSelect = document.getElementById("scannerCameraSelect");
    const captureCanvas = document.createElement("canvas");
    const captureContext = captureCanvas.getContext("2d", {
        willReadFrequently: true
    });
    const scanRegion = Object.freeze({
        x: 0.08,
        y: 0.35,
        width: 0.84,
        height: 0.30
    });

    let codeReader = null;
    let targetInput = null;
    let targetFormat = "barcode";
    let stopping = false;
    let resultAccepted = false;
    let nativeDetector = null;
    let scanTimer = null;

    function setStatus(message, type) {
        status.textContent = message;
        status.classList.toggle(
            "scanner-status-error",
            type === "error"
        );
    }

    function stopScanner(options) {
        const settings = options || {};

        if (stopping) {
            return;
        }

        stopping = true;

        if (scanTimer) {
            window.clearTimeout(scanTimer);
            scanTimer = null;
        }

        nativeDetector = null;

        if (video.srcObject) {
            for (const track of video.srcObject.getTracks()) {
                track.stop();
            }

            video.srcObject = null;
        }

        codeReader = null;

        if (settings.closeDialog && dialog.open) {
            dialog.close();
        }

        stopping = false;
    }

    function normalizeScannedValue(rawValue) {
        const value = String(rawValue || "").trim();

        if (targetFormat === "tote") {
            if (
                window.DVD_TOTES &&
                typeof window.DVD_TOTES.normalizeCode === "function"
            ) {
                return window.DVD_TOTES.normalizeCode(value);
            }

            return value.toUpperCase();
        }

        if (targetFormat === "upc") {
            const compactValue = value.replace(/\s+/g, "");

            if (/^0\d{12}$/.test(compactValue)) {
                return compactValue.substring(1);
            }

            return compactValue;
        }

        return value;
    }

    function acceptResult(result) {
        if (resultAccepted || !targetInput || !result) {
            return;
        }

        const normalized = normalizeScannedValue(result.getText());

        if (!normalized) {
            setStatus(
                targetFormat === "tote"
                    ? "That barcode is not a valid tote code. Keep scanning."
                    : "That barcode could not be read. Keep scanning.",
                "error"
            );
            return;
        }

        resultAccepted = true;
        targetInput.value = normalized;
        targetInput.dispatchEvent(
            new Event("input", { bubbles: true })
        );
        targetInput.dispatchEvent(
            new Event("change", { bubbles: true })
        );
        stopScanner({ closeDialog: true });
        targetInput.focus();
    }

    function createCodeReader() {
        const zxing = window.ZXingBrowser;

        if (targetFormat === "tote") {
            return new zxing.BrowserMultiFormatReader();
        }

        const formats = [
            zxing.BarcodeFormat.UPC_A,
            zxing.BarcodeFormat.UPC_E
        ];

        const reader =
            new zxing.BrowserMultiFormatOneDReader(
                undefined,
                {
                    delayBetweenScanAttempts: 40,
                    delayBetweenScanSuccess: 500
                }
            );

        reader.possibleFormats = formats;

        return reader;
    }

    async function optimizeCameraFocus() {
        const track = video.srcObject
            ?.getVideoTracks()[0];

        if (
            !track ||
            typeof track.getCapabilities !== "function" ||
            typeof track.applyConstraints !== "function"
        ) {
            return;
        }

        const capabilities = track.getCapabilities();

        if (
            Array.isArray(capabilities.focusMode) &&
            capabilities.focusMode.includes("continuous")
        ) {
            try {
                await track.applyConstraints({
                    advanced: [
                        {
                            focusMode: "continuous"
                        }
                    ]
                });
            }
            catch (error) {
                console.debug(
                    "Continuous camera focus is unavailable:",
                    error
                );
            }
        }
    }

    async function startNativeDetector() {
        if (
            targetFormat !== "upc" ||
            typeof window.BarcodeDetector !== "function"
        ) {
            return;
        }

        try {
            const requestedFormats = [
                "upc_a",
                "upc_e",
                "ean_13",
                "ean_8",
                "code_128"
            ];
            const supportedFormats =
                typeof window.BarcodeDetector
                    .getSupportedFormats === "function"
                    ? await window.BarcodeDetector
                        .getSupportedFormats()
                    : requestedFormats;
            const formats = requestedFormats.filter(
                (format) => supportedFormats.includes(format)
            );

            if (formats.length === 0) {
                return;
            }

            nativeDetector = new window.BarcodeDetector({
                formats
            });
        }
        catch (error) {
            console.debug(
                "Native barcode detection is unavailable:",
                error
            );
        }
    }

    function updateScanGuide() {
        if (
            !preview ||
            !guide ||
            !video.videoWidth ||
            !video.videoHeight
        ) {
            return;
        }

        const previewWidth = preview.clientWidth;
        const previewHeight = preview.clientHeight;

        if (previewWidth <= 0 || previewHeight <= 0) {
            return;
        }

        const scale = Math.min(
            previewWidth / video.videoWidth,
            previewHeight / video.videoHeight
        );
        const renderedWidth = video.videoWidth * scale;
        const renderedHeight = video.videoHeight * scale;
        const renderedLeft =
            (previewWidth - renderedWidth) / 2;
        const renderedTop =
            (previewHeight - renderedHeight) / 2;

        guide.style.left =
            `${renderedLeft + (renderedWidth * scanRegion.x)}px`;
        guide.style.top =
            `${renderedTop + (renderedHeight * scanRegion.y)}px`;
        guide.style.width =
            `${renderedWidth * scanRegion.width}px`;
        guide.style.height =
            `${renderedHeight * scanRegion.height}px`;
    }

    function drawScanRegion() {
        if (
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            !video.videoWidth ||
            !video.videoHeight
        ) {
            return false;
        }

        const sourceX = Math.round(
            video.videoWidth * scanRegion.x
        );
        const sourceY = Math.round(
            video.videoHeight * scanRegion.y
        );
        const sourceWidth = Math.round(
            video.videoWidth * scanRegion.width
        );
        const sourceHeight = Math.round(
            video.videoHeight * scanRegion.height
        );
        const outputWidth = Math.min(sourceWidth, 1600);
        const outputHeight = Math.max(
            1,
            Math.round(
                sourceHeight * (outputWidth / sourceWidth)
            )
        );

        if (
            captureCanvas.width !== outputWidth ||
            captureCanvas.height !== outputHeight
        ) {
            captureCanvas.width = outputWidth;
            captureCanvas.height = outputHeight;
        }

        captureContext.drawImage(
            video,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            outputWidth,
            outputHeight
        );

        return true;
    }

    async function scanActiveRegion() {
        if (
            resultAccepted ||
            !dialog.open ||
            !codeReader
        ) {
            return;
        }

        if (drawScanRegion()) {
            try {
                acceptResult(
                    codeReader.decodeFromCanvas(captureCanvas)
                );
            }
            catch (error) {
                // A missed frame is expected while the user aligns a barcode.
            }

            if (!resultAccepted && nativeDetector) {
                const detector = nativeDetector;

                try {
                    const barcodes =
                        await detector.detect(captureCanvas);

                    if (
                        nativeDetector === detector &&
                        dialog.open &&
                        barcodes.length > 0 &&
                        barcodes[0].rawValue
                    ) {
                        acceptResult({
                            getText() {
                                return barcodes[0].rawValue;
                            }
                        });
                    }
                }
                catch (error) {
                    // Native detection may also miss frames during alignment.
                }
            }
        }

        if (!resultAccepted && dialog.open && codeReader) {
            scanTimer = window.setTimeout(
                scanActiveRegion,
                80
            );
        }
    }

    function getCameraConstraints(deviceId) {
        const constraints = {
            width: {
                ideal: 1920
            },
            height: {
                ideal: 1080
            }
        };

        if (deviceId) {
            constraints.deviceId = {
                exact: deviceId
            };
        }
        else {
            constraints.facingMode = {
                ideal: "environment"
            };
        }

        return constraints;
    }

    function getCameraErrorMessage(error) {
        const name = error && error.name ? error.name : "";

        if (
            name === "NotAllowedError" ||
            name === "PermissionDeniedError"
        ) {
            return "Camera access was denied. Allow camera access in the browser and try again.";
        }

        if (
            name === "NotFoundError" ||
            name === "DevicesNotFoundError"
        ) {
            return "No camera was found on this device.";
        }

        if (!window.isSecureContext) {
            return "Camera scanning requires a secure HTTPS connection.";
        }

        return "The camera could not be started. Close other camera apps and try again.";
    }

    async function updateCameraChoices() {
        try {
            const devices =
                await window.ZXingBrowser.BrowserCodeReader
                    .listVideoInputDevices();

            if (!devices || devices.length < 2) {
                cameraRow.classList.add("hidden");
                return;
            }

            const currentDeviceId = video.srcObject
                ? video.srcObject.getVideoTracks()[0]
                    ?.getSettings().deviceId
                : "";

            cameraSelect.replaceChildren();

            devices.forEach((device, index) => {
                const option = document.createElement("option");

                option.value = device.deviceId;
                option.textContent =
                    device.label || `Camera ${index + 1}`;
                option.selected = device.deviceId === currentDeviceId;
                cameraSelect.appendChild(option);
            });

            cameraRow.classList.remove("hidden");
        }
        catch (error) {
            console.error("Could not list cameras:", error);
            cameraRow.classList.add("hidden");
        }
    }

    async function startWithConstraints(constraints) {
        stopScanner();
        resultAccepted = false;
        codeReader = createCodeReader();
        setStatus(
            targetFormat === "tote"
                ? "Point the camera at the tote barcode."
                : "Fill the yellow box with the DVD barcode and hold it steady.",
            "info"
        );

        try {
            const stream =
                await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: constraints
                });

            video.srcObject = stream;
            await video.play();

            await optimizeCameraFocus();
            await startNativeDetector();
            await updateCameraChoices();
            updateScanGuide();
            window.requestAnimationFrame(updateScanGuide);
            scanActiveRegion();
        }
        catch (error) {
            console.error("Camera scanner failed to start:", error);
            stopScanner();
            setStatus(getCameraErrorMessage(error), "error");
        }
    }

    async function openScanner(input, format) {
        if (!dialog || !video) {
            return;
        }

        targetInput = input;
        targetFormat = format || "barcode";
        resultAccepted = false;
        cameraRow.classList.add("hidden");
        title.textContent = targetFormat === "tote"
            ? "Scan Tote Label"
            : "Scan DVD Barcode";
        setStatus("Starting camera...", "info");

        if (!window.ZXingBrowser) {
            dialog.showModal();
            setStatus(
                "The barcode scanner could not be loaded. Check the connection and refresh the page.",
                "error"
            );
            return;
        }

        dialog.showModal();

        await startWithConstraints(getCameraConstraints());
    }

    document
        .querySelectorAll("[data-camera-target]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                const input = document.getElementById(
                    button.dataset.cameraTarget
                );

                if (input) {
                    openScanner(
                        input,
                        button.dataset.cameraFormat
                    );
                }
            });
        });

    closeButton.addEventListener("click", () => {
        stopScanner({ closeDialog: true });
    });

    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        stopScanner({ closeDialog: true });
    });

    dialog.addEventListener("close", () => {
        stopScanner();
    });

    cameraSelect.addEventListener("change", async () => {
        const deviceId = cameraSelect.value;

        if (deviceId) {
            await startWithConstraints(
                getCameraConstraints(deviceId)
            );
        }
    });

    window.addEventListener("pagehide", () => {
        stopScanner();
    });

    window.addEventListener("resize", updateScanGuide);
    video.addEventListener("loadedmetadata", updateScanGuide);

    if (typeof window.ResizeObserver === "function" && preview) {
        const previewObserver =
            new window.ResizeObserver(updateScanGuide);

        previewObserver.observe(preview);
    }
})();
