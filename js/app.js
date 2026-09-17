"use strict";

const pages = document.querySelectorAll(".page");
const pageButtons = document.querySelectorAll("[data-page]");

const navigation = document.getElementById("mainNavigation");
const menuButton = document.getElementById("menuButton");


function showPage(pageName) {

    const target = document.getElementById(pageName);

    if (!target) {
        return;
    }

    pages.forEach((page) => {
        page.classList.remove("active");
    });

    target.classList.add("active");


    document
        .querySelectorAll(".main-navigation [data-page]")
        .forEach((button) => {

            button.classList.toggle(
                "active",
                button.dataset.page === pageName
            );

        });


    navigation.classList.remove("open");

    menuButton.setAttribute(
        "aria-expanded",
        "false"
    );


    if (window.location.hash !== `#${pageName}`) {
        history.replaceState(
            null,
            "",
            `#${pageName}`
        );
    }


    window.scrollTo({
        top: 0,
        behavior: "instant"
    });

}


pageButtons.forEach((button) => {

    button.addEventListener("click", (event) => {

        const pageName = button.dataset.page;

        if (!pageName) {
            return;
        }

        event.preventDefault();

        showPage(pageName);

    });

});


menuButton.addEventListener("click", () => {

    const isOpen =
        navigation.classList.toggle("open");

    menuButton.setAttribute(
        "aria-expanded",
        String(isOpen)
    );

});


document
    .querySelectorAll("[data-camera-target]")
    .forEach((button) => {

        button.addEventListener("click", () => {

            const targetId =
                button.dataset.cameraTarget;

            const input =
                document.getElementById(targetId);

            if (input) {
                input.focus();
            }

            alert(
                "Camera barcode scanning is coming next."
            );

        });

    });


const initialPage =
    window.location.hash.substring(1) ||
    "dashboard";

showPage(initialPage);


// ------------------------------------------------------------
// Export UI
// ------------------------------------------------------------

let selectedExportFormat = "csv";

const exportScopeInputs =
    document.querySelectorAll('input[name="exportScope"]');

const exportToteOptions =
    document.getElementById("exportToteOptions");

const exportHistoryOptions =
    document.getElementById("exportHistoryOptions");

const exportFormatButtons =
    document.querySelectorAll("[data-export-format]");

const exportButton =
    document.getElementById("exportButton");


function updateExportOptions() {

    const selectedScope =
        document.querySelector(
            'input[name="exportScope"]:checked'
        )?.value;

    if (exportToteOptions) {

        const needsTote =
            selectedScope === "tote" ||
            selectedScope === "totes";

        exportToteOptions.classList.toggle(
            "hidden",
            !needsTote
        );

    }

    if (exportHistoryOptions) {

        exportHistoryOptions.classList.toggle(
            "hidden",
            selectedScope !== "history"
        );

    }

}


exportScopeInputs.forEach((input) => {

    input.addEventListener(
        "change",
        updateExportOptions
    );

});


exportFormatButtons.forEach((button) => {

    button.addEventListener("click", () => {

        selectedExportFormat =
            button.dataset.exportFormat;

        exportFormatButtons.forEach((candidate) => {

            candidate.classList.toggle(
                "selected",
                candidate === button
            );

        });

    });

});


if (exportButton) {

    exportButton.addEventListener("click", () => {

        const scope =
            document.querySelector(
                'input[name="exportScope"]:checked'
            )?.value || "all";

        const formatName = {
            csv: "CSV",
            xlsx: "Excel XLSX",
            pdf: "PDF"
        }[selectedExportFormat];

        alert(
            `Export configuration ready.\n\n` +
            `Scope: ${scope}\n` +
            `Format: ${formatName}\n\n` +
            `Actual file generation will be connected ` +
            `to persistent inventory data.`
        );

    });

}


updateExportOptions();
