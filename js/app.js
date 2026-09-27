"use strict";

const pages = document.querySelectorAll(".page");
const pageButtons = document.querySelectorAll("[data-page]");

const navigation = document.getElementById("mainNavigation");
const menuButton = document.getElementById("menuButton");
const copyrightYear = document.getElementById("copyrightYear");
const dvdCount = document.getElementById("dvdCount");
const editionCount = document.getElementById("editionCount");
const toteCount = document.getElementById("toteCount");
const checkoutCount = document.getElementById("checkoutCount");

let dashboardAuthenticated = false;
let dashboardRequest = 0;

if (copyrightYear) {
    const firstYear = 2026;
    const currentYear = new Date().getFullYear();

    copyrightYear.textContent = currentYear > firstYear
        ? `© ${firstYear}–${currentYear}`
        : `© ${firstYear}`;
}


function displayCount(element, value) {
    if (element) {
        element.textContent = Number(value || 0).toLocaleString();
    }
}


async function loadDashboard() {
    if (!dashboardAuthenticated || !window.dvdSupabase) {
        return;
    }

    const request = dashboardRequest + 1;

    dashboardRequest = request;

    const dashboard = document.getElementById("dashboard");

    if (dashboard) {
        dashboard.setAttribute("aria-busy", "true");
    }

    try {
        const { data, error } = await window.dvdSupabase.rpc(
            "dashboard_stats"
        );

        if (error) {
            throw error;
        }

        if (request !== dashboardRequest) {
            return;
        }

        const stats = Array.isArray(data) ? data[0] : data;

        displayCount(dvdCount, stats && stats.dvd_copies);
        displayCount(editionCount, stats && stats.unique_editions);
        displayCount(toteCount, stats && stats.totes);
        displayCount(checkoutCount, stats && stats.checked_out);
    }
    catch (error) {
        console.error("Failed to load dashboard totals:", error);
    }
    finally {
        if (dashboard && request === dashboardRequest) {
            dashboard.removeAttribute("aria-busy");
        }
    }
}


function showPage(pageName) {

    const target = document.getElementById(pageName);

    if (!target) {
        return;
    }

    pages.forEach((page) => {
        page.classList.remove("active");
    });

    target.classList.add("active");

    if (pageName === "dashboard") {
        loadDashboard();
    }


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


window.DVD_APP = Object.freeze({
    showPage
});


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


window.addEventListener("dvd-auth-ready", () => {
    dashboardAuthenticated = true;
    loadDashboard();
});


window.addEventListener("dvd-inventory-changed", loadDashboard);


if (
    window.DVD_AUTH &&
    typeof window.DVD_AUTH.isAuthenticated === "function" &&
    window.DVD_AUTH.isAuthenticated()
) {
    dashboardAuthenticated = true;
    loadDashboard();
}


const initialPage =
    window.location.hash.substring(1) ||
    "dashboard";

showPage(initialPage);
