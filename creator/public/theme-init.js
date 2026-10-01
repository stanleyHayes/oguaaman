// Applies the saved (or system) theme before first paint. Loaded as a plain
// external script so the Content-Security-Policy needs no 'unsafe-inline'.
(function () {
  try {
    var t = localStorage.getItem("oguaa.theme");
    if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
