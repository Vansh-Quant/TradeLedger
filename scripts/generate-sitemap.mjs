#!/usr/bin/env node
/**
 * Generates public/sitemap.xml (and stamps robots.txt) for the PUBLIC pages
 * only. Private workstation routes must never appear here — crawlers get a
 * noindex meta tag from the root route plus Disallow rules in robots.txt.
 *
 * Usage:
 *   npm run seo:sitemap -- --site https://your-domain.example
 *   VITE_SITE_URL=https://your-domain.example npm run seo:sitemap
 *
 * The site URL must be absolute and https in production; the script refuses
 * to write a sitemap without one rather than emitting incorrect URLs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const argIndex = process.argv.indexOf("--site");
const siteArg = argIndex >= 0 ? process.argv[argIndex + 1] : undefined;
const site = (siteArg ?? process.env.VITE_SITE_URL ?? "").trim().replace(/\/+$/, "");

if (!site) {
  console.error("seo:sitemap: no site URL. Pass --site https://your-domain or set VITE_SITE_URL.");
  process.exit(1);
}
let parsed;
try {
  parsed = new URL(site);
} catch {
  console.error(`seo:sitemap: "${site}" is not a valid absolute URL.`);
  process.exit(1);
}
if (parsed.protocol !== "https:" && process.env.TRADELEDGER_ENV === "production") {
  console.error("seo:sitemap: production sitemaps require https.");
  process.exit(1);
}

// Public routes only. The future landing page stays at "/".
const publicPaths = ["/"];
const today = new Date().toISOString().slice(0, 10);

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...publicPaths.map((path) => [
    "  <url>",
    `    <loc>${site}${path === "/" ? "/" : path}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    "    <changefreq>weekly</changefreq>",
    path === "/" ? "    <priority>1.0</priority>" : "    <priority>0.5</priority>",
    "  </url>",
  ].join("\n")),
  "</urlset>",
  "",
].join("\n");

const sitemapPath = resolve(root, "packages/workstation-glass/public/sitemap.xml");
writeFileSync(sitemapPath, xml, "utf8");

// Stamp the Sitemap line into robots.txt (replace or append).
const robotsPath = resolve(root, "packages/workstation-glass/public/robots.txt");
let robots = readFileSync(robotsPath, "utf8");
const sitemapLine = `Sitemap: ${site}/sitemap.xml`;
robots = robots.replace(/^Sitemap: .*$/m, "").replace(/\n{3,}/g, "\n\n").trimEnd();
robots += `\n\n${sitemapLine}\n`;
writeFileSync(robotsPath, robots, "utf8");

console.log(`seo:sitemap: wrote ${sitemapPath}`);
console.log(`seo:sitemap: stamped "${sitemapLine}" into robots.txt`);