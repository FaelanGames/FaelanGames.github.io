/*
 * Site theme. Dark is the default; light applies only once a visitor has
 * chosen it, and the choice is kept in localStorage across pages.
 *
 * Loaded synchronously in <head> so the theme is on the root element before
 * the stylesheet paints. If storage is unavailable the toggle still works for
 * the current page.
 */
(function () {
    var storageKey = "faelan-theme";
    var root = document.documentElement;

    function savedTheme() {
        try {
            return localStorage.getItem(storageKey) === "light" ? "light" : "dark";
        } catch (error) {
            return "dark";
        }
    }

    function applyTheme(theme) {
        root.setAttribute("data-theme", theme);
        root.style.colorScheme = theme;

        var button = document.querySelector(".theme-toggle");

        if (button) {
            var next = theme === "light" ? "dark" : "light";

            button.setAttribute("aria-label", "Switch to " + next + " mode");
            button.querySelector(".theme-toggle-text").textContent =
                next === "light" ? "Light" : "Dark";
        }
    }

    applyTheme(savedTheme());

    document.addEventListener("DOMContentLoaded", function () {
        var button = document.querySelector(".theme-toggle");

        if (!button) {
            return;
        }

        applyTheme(root.getAttribute("data-theme"));

        button.addEventListener("click", function () {
            var theme = root.getAttribute("data-theme") === "light" ? "dark" : "light";

            applyTheme(theme);

            try {
                localStorage.setItem(storageKey, theme);
            } catch (error) {
                /* Storage is blocked; the theme still applies to this page. */
            }
        });
    });
})();
