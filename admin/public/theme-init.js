// Applies the saved (or system) colour theme before first paint. Kept as a
// same-origin file, not an inline script, so the CSP can stay script-src 'self'.
(function () {
  try {
    var t = localStorage.getItem("oguaa.theme");
    if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    /* storage unavailable: keep the default theme */
  }
})();
