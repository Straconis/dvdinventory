(function () {
    "use strict";

    const dialog = document.getElementById("barcodeScannerDialog");
    const video = document.getElementById("scannerVideo");
    const title = document.getElementById("scannerTitle");
    const status = document.getElementById("scannerStatus");
    const closeButton = document.getElementById("closeScannerButton");
    const cameraRow = document.getElementById("scannerCameraRow");
    const cameraSelect = document.getElementById("scannerCameraSelect");

    let codeReader = null;
    let scannerControls = null;
    let targetInput = null;
    let targetFormat = "barcode";
    let stopping = false;
    let resultAccepted = false;

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

        if (scannerControls) {
            scannerControls.stop();
            scannerControls = null;
        }

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
            return value.replace(/\s+/g, "");
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

    function handleDecode(result) {
        if (result) {
            acceptResult(result);
        }
    }

    function createCodeReader() {
        const zxing = window.ZXingBrowser;
        const formats = targetFormat === "tote"
            ? [zxing.BarcodeFormat.CODE_128]
            : [
                zxing.BarcodeFormat.UPC_A,
                zxing.BarcodeFormat.UPC_E,
                zxing.BarcodeFormat.EAN_13,
                zxing.BarcodeFormat.EAN_8,
                zxing.BarcodeFormat.CODE_128
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
            scannerControls = await codeReader.decodeFromConstraints(
                {
                    audio: false,
                    video: constraints
                },
                video,
                handleDecode
            );

            await updateCameraChoices();
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
})();
