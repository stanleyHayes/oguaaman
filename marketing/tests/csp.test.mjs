// Guards the marketing site's Content-Security-Policy (spec section 9.6).
// Ads load client-side from the API (slate + keepalive view beacon), so
// connect-src must keep allowing https://api.oguaaman.com. The site never takes
// payments and never talks to the raw Render host, so neither may creep in.
// Runs with `pnpm test` and before every `pnpm build` (CI and Vercel).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

function csp() {
  for (const rule of config.headers ?? []) {
    for (const header of rule.headers ?? []) {
      if (header.key.toLowerCase() === "content-security-policy") return header.value;
    }
  }
  return "";
}

function directive(name) {
  const part = csp()
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.split(/\s+/)[0] === name);
  return part ? part.split(/\s+/).slice(1) : [];
}

test("vercel.json sets a Content-Security-Policy", () => {
  assert.notEqual(csp(), "", "no Content-Security-Policy header in vercel.json");
});

test("connect-src allows the API for the ad slate and view beacon", () => {
  assert.ok(directive("connect-src").includes("https://api.oguaaman.com"), `connect-src is: ${directive("connect-src").join(" ")}`);
});

test("img-src allows https creatives (Cloudinary)", () => {
  assert.ok(directive("img-src").includes("https:"), `img-src is: ${directive("img-src").join(" ")}`);
});

test("no payment provider or raw Render host in the policy", () => {
  const policy = csp().toLowerCase();
  assert.ok(!policy.includes("paystack"), "the marketing site must not load Paystack");
  assert.ok(!policy.includes("onrender.com"), "use api.oguaaman.com, not the Render host");
});
