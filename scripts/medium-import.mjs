#!/usr/bin/env node

/**
 * Batch import articles to Medium using the "Import a story" feature.
 *
 * Usage:
 *   1. Start Chrome with remote debugging:
 *      /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *        --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-medium
 *
 *   2. In that Chrome window, go to medium.com and log in manually.
 *
 *   3. Run the import:
 *      node scripts/medium-import.mjs
 *
 *   Options:
 *     --dry-run     Show URLs without importing
 *     --publish     Auto-publish after import (default: draft only)
 *     --limit=N     Only import N articles
 */

import { chromium } from "playwright";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE_URL = "https://recca0120.github.io";
const CDP_URL = "http://127.0.0.1:9222";

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const autoPublish = args.includes("--publish");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;

function parseFrontmatter(filepath) {
  const content = readFileSync(filepath, "utf-8");
  const parts = content.split("---");
  if (parts.length < 3) return null;

  const fmText = parts[1];
  const fm = {};
  let currentKey = null;
  let listValues = [];

  for (const line of fmText.trim().split("\n")) {
    if (line.startsWith("- ") && currentKey) {
      listValues.push(line.slice(2).trim().replace(/^['"]|['"]$/g, ""));
    } else {
      if (currentKey && listValues.length) {
        fm[currentKey] = listValues;
        listValues = [];
      }
      if (line.includes(":")) {
        const idx = line.indexOf(":");
        const key = line.slice(0, idx).trim();
        const val = line
          .slice(idx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        currentKey = key;
        if (val) {
          fm[key] = val;
        } else {
          listValues = [];
        }
      }
    }
  }
  if (currentKey && listValues.length) {
    fm[currentKey] = listValues;
  }
  return fm;
}

function getArticles() {
  const postDir = join(ROOT, "content", "post");
  const dirs = readdirSync(postDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const articles = [];
  const now = new Date();

  for (const dir of dirs) {
    const enFile = join(postDir, dir, "index.en.md");
    if (!existsSync(enFile)) continue;

    const fm = parseFrontmatter(enFile);
    if (!fm) continue;
    if (fm.draft === "true") continue;

    const dateStr = fm.date || "";
    let dt;
    try {
      dt = new Date(dateStr);
      if (dt > now) continue;
    } catch {
      continue;
    }

    const slug = fm.slug || dir;
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    const url = `${SITE_URL}/en/${year}/${month}/${day}/${slug}/`;

    articles.push({
      title: fm.title || dir,
      url,
      date: dt,
    });
  }

  articles.sort((a, b) => a.date - b.date);
  return articles;
}

async function importArticle(page, article) {
  await page.goto("https://medium.com/p/import", {
    waitUntil: "networkidle",
  });

  // URL input is a contenteditable div, not an <input>
  const input = await page.waitForSelector(
    '.js-importUrl, div[role="textbox"]',
    { timeout: 15000 }
  );

  await input.click();
  // Clear existing text and type the URL
  await page.keyboard.press("Meta+a");
  await page.keyboard.type(article.url);

  // Click import button
  const importBtn = await page.waitForSelector(
    'button:has-text("Import")',
    { timeout: 5000 }
  );
  await importBtn.click();

  // Wait for import to complete - page navigates to the draft editor
  try {
    await page.waitForURL(/medium\.com\/.*(edit|draft|new-story|p\/)/, { timeout: 30000 });
    console.log(`  ✓ Imported: ${article.title} -> ${page.url()}`);

    if (autoPublish) {
      const storyLink = await page.$(
        'a:has-text("See your story"), a:has-text("Go to story")'
      );
      if (storyLink) {
        await storyLink.click();
        await page.waitForLoadState("networkidle");

        try {
          const publishBtn = await page.waitForSelector(
            'button:has-text("Publish")',
            { timeout: 5000 }
          );
          await publishBtn.click();

          try {
            const confirmBtn = await page.waitForSelector(
              'button:has-text("Publish now"), button:has-text("Publish")',
              { timeout: 5000 }
            );
            await confirmBtn.click();
            await page.waitForTimeout(2000);
            console.log(`  ✓ Published: ${article.title}`);
          } catch {
            console.log(`  ⚠ Could not confirm publish: ${article.title}`);
          }
        } catch {
          console.log(`  ⚠ Could not find publish button: ${article.title}`);
        }
      }
    }
    return true;
  } catch {
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log(`  ✗ Failed: ${article.title}`);
    console.log(`  Page: ${page.url()}`);
    console.log(`  Content: ${bodyText.slice(0, 200)}`);
    return false;
  }
}

async function main() {
  const articles = getArticles();
  const toImport = articles.slice(0, limit);

  console.log(`Found ${articles.length} articles, importing ${toImport.length}\n`);

  if (dryRun) {
    for (const a of toImport) {
      console.log(`  ${a.title}`);
      console.log(`  ${a.url}\n`);
    }
    return;
  }

  // Connect to existing Chrome instance
  console.log("Connecting to Chrome on port 9222...");
  console.log("Make sure Chrome is running with: ");
  console.log('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-medium\n');

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (e) {
    console.error("Failed to connect. Is Chrome running with --remote-debugging-port=9222?");
    console.error(e.message);
    process.exit(1);
  }

  const context = browser.contexts()[0];
  // Reuse existing Medium tab instead of opening a new one
  const pages = context.pages();
  const page = pages.find((p) => p.url().includes("medium.com")) || (await context.newPage());

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < toImport.length; i++) {
    const article = toImport[i];
    console.log(`[${i + 1}/${toImport.length}] ${article.title}`);

    try {
      const success = await importArticle(page, article);
      if (success) ok++;
      else fail++;
    } catch (e) {
      console.log(`  ✗ Error: ${e.message}`);
      fail++;
    }

    if (i < toImport.length - 1) {
      await page.waitForTimeout(3000);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Imported: ${ok}`);
  console.log(`Failed:   ${fail}`);

  // Keep Chrome open
}

main().catch(console.error);
