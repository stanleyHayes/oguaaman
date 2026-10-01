// Resolve the theme before first paint (no flash): stored choice wins, else the
// OS preference. Mirrors the client portal (oguaa.theme key). Loaded as a
// blocking <script src> from index.html rather than inline, so the
// Content-Security-Policy in vercel.json can stay script-src 'self'.
(function () {
  try {
    var saved = localStorage.getItem("oguaa.theme");
    var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {}
})();
