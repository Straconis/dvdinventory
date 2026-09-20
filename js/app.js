"use strict";

const pages = document.querySelectorAll(".page");
const pageButtons = document.querySelectorAll("[data-page]");

const navigation = document.getElementById("mainNavigation");
const menuButton = document.getElementById("menuButton");
const copyrightYear = document.getElementById("copyrightYear");

if (copyrightYear) {
    const firstYear = 2026;
    const currentYear = new Date().getFullYear();

    copyrightYear.textContent = currentYear > firstYear
        ? `© ${firstYear}–${currentYear}`
        : `© ${firstYear}`;
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


const initialPage =
    window.location.hash.substring(1) ||
    "dashboard";

showPage(initialPage);
