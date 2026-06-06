import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const notesRoot = path.resolve(
  process.env.TECH_ARCHIVE_NOTES ||
    path.join(process.env.HOME, "Desktop/Report/海外技術情報アーカイブ/解説ノート"),
);

const outArticles = path.join(repoRoot, "articles");
const outData = path.join(repoRoot, "data");
const outAssets = path.join(repoRoot, "assets");
const interestsRoot = path.resolve(
  process.env.INTEREST_NOTES || path.join(process.env.HOME, "Desktop/Report/興味"),
);
const outInterests = path.join(repoRoot, "interests");
const outInterestArticles = path.join(outInterests, "articles");
const outInterestCategories = path.join(outInterests, "categories");

fs.mkdirSync(outArticles, { recursive: true });
fs.mkdirSync(outData, { recursive: true });
fs.mkdirSync(outAssets, { recursive: true });

for (const file of fs.readdirSync(outArticles)) {
  if (file.endsWith(".html")) fs.unlinkSync(path.join(outArticles, file));
}
fs.rmSync(outInterests, { recursive: true, force: true });
fs.mkdirSync(outInterestArticles, { recursive: true });
fs.mkdirSync(outInterestCategories, { recursive: true });

const genreLabels = {
  AI: "AI / LLM / Agent",
  SAP_ERP: "SAP / ERP",
  Security: "Security",
};

function walkMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkMarkdown(full);
      if (entry.isFile() && entry.name.endsWith(".md")) return [full];
      return [];
    })
    .sort();
}

function parseFrontMatter(raw) {
  if (!raw.startsWith("---\n")) return [{}, raw];
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return [{}, raw];
  const yaml = raw.slice(4, end).trim();
  const body = raw.slice(end + 5).trimStart();
  const meta = {};

  for (const line of yaml.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    meta[key] = value.replace(/^["']|["']$/g, "");
  }

  return [meta, body];
}

function titleFromMarkdown(body, fallback) {
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return fallback.replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/_/g, " ");
}

function slugify(file) {
  const base = path.basename(file, ".md");
  return base
    .replace(/[\\/:*?"<>|#%&{}$!@`+=\s]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(value) {
  const escaped = escapeHtml(value);
  const links = [];
  const withMarkdownLinks = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) => {
    const token = `@@LINK_${links.length}@@`;
    links.push(`<a href="${url}">${label}</a>`);
    return token;
  });

  return withMarkdownLinks
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/@@LINK_(\d+)@@/g, (_, index) => links[Number(index)] || "");
}

function markdownToHtml(body) {
  const lines = body.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    html.push("<ul>");
    for (const item of list) html.push(`<li>${inlineMarkdown(item)}</li>`);
    html.push("</ul>");
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return html.join("\n");
}

function excerptFrom(body) {
  const excerpt = body
    .replace(/^# .+$/m, "")
    .replace(/^## .+$/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return excerpt.length >= 180 ? `${excerpt}...` : excerpt;
}

function pageShell({
  title,
  description,
  body,
  current = "",
  siteTitle = "海外技術情報アーカイブ",
  siteSubtitle = "AI / SAP / Security trend notes",
  homeHref = "index.html",
}) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | ${escapeHtml(siteTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="${current}assets/style.css">
</head>
<body>
  <header class="site-header">
    <a class="site-title" href="${current}${homeHref}">${escapeHtml(siteTitle)}</a>
    <span class="site-subtitle">${escapeHtml(siteSubtitle)}</span>
  </header>
  <main>
${body}
  </main>
</body>
</html>`;
}

function redactSensitive(value) {
  const moneyPattern = /[▲△-]?[\d,]+(?:\.\d+)?(?:万円|億円|万|億|円)(?:[〜～\-–][\d,]+(?:\.\d+)?(?:万円|億円|万|億|円))?(?:\/年|\/月|年|月|前後|程度|以上|以下|以内)?/g;
  const sensitiveLinePattern =
    /(年収|現在年収|手取り|年間支出|生活消費|生活費|DC|NISA|投資信託|株式|流動性投資|流動投資資産|流動資産|退職給付|住宅ローン|ローン残|現金余力|金融資産|総資産|資産額|自己資金|借入|年間手残り|不足生活費|現在ポートフォリオ|評価額|残高|掛金|退職金見込|追加投資力)/;

  return String(value)
    .split(/\r?\n/)
    .map((line) => {
      if (!sensitiveLinePattern.test(line)) return line;
      return line.replace(moneyPattern, "[金額伏せ]").replace(/\b\d{1,2}歳\b/g, "[年齢伏せ]");
    })
    .join("\n")
    .replace(/\/Users\/yamaai(?:\/[^\s`'"<>)]*)?/g, "[内部パス]")
    .replace(/~\/Desktop(?:\/[^\s`'"<>)]*)?/g, "[内部パス]")
    .replace(/\bDesktop\/(?:[^\s`'"<>)]*)?/g, "[内部パス]")
    .replace(/\bRyoheiさん\b|\bRyohei\b/g, "個人")
    .replace(/マスター/g, "個人")
    .replace(/東京都荒川区周辺|東京都荒川区|荒川区周辺|荒川区|荒川\d+丁目|東尾久|熊野前|西日暮里|三河島|町屋|三ノ輪|西尾久/g, "[具体地名伏せ]")
    .replace(/年齢\s*[:：]\s*\d{1,2}歳(?:（[^）]*）)?/g, "年齢: [年齢伏せ]")
    .replace(/\d{1,2}歳（[^）]*(?:保存ペルソナ|ペルソナ)[^）]*）/g, "[年齢伏せ]")
    .replace(/38歳/g, "[年齢伏せ]")
    .replace(/年[\d,]+万円投資/g, "年[金額伏せ]投資")
    .replace(/2026年時点で30代後半〜40歳前後/g, "[年齢帯伏せ]")
    .replace(
      /(年収|手取り収入|手取り|年間支出|生活消費|DC|NISA|旧つみたてNISA|新つみたてNISA|成長投資枠|流動性投資|退職給付|住宅ローン残|住宅ローン|ローン返済|現金余力|金融資産|総資産|資産額|自己資金|借入|年間手残り|不足生活費)([^。\n|]*?)(約?[▲△-]?[\d,]+(?:\.\d+)?(?:万|億)?円(?:[〜～\-–][\d,]+(?:\.\d+)?(?:万|億)?円)?(?:\/年|\/月|年|月|前後|程度|以上|以下|以内)?)/g,
      "$1$2[金額伏せ]",
    );
}

function stableSlug(file, title, category) {
  const date = path.basename(file).match(/\d{4}-\d{2}-\d{2}/)?.[0] || "note";
  const hash = crypto.createHash("sha1").update(file).digest("hex").slice(0, 10);
  const titlePart = slugify({ title }.title).slice(0, 42) || "article";
  return `${date}-${slugify(category)}-${titlePart}-${hash}`;
}

function categoryFromInterestFile(file) {
  return path.relative(interestsRoot, path.dirname(file)).split(path.sep)[0] || "未分類";
}

const notes = walkMarkdown(notesRoot).map((file) => {
  const raw = redactSensitive(fs.readFileSync(file, "utf8"));
  const [meta, body] = parseFrontMatter(raw);
  const title = titleFromMarkdown(body, path.basename(file, ".md"));
  const slug = slugify(file);
  const genre = meta.genre || path.basename(path.dirname(file));
  return {
    file,
    slug,
    title,
    genre,
    genreLabel: genreLabels[genre] || genre,
    created: meta.created || "",
    source: meta.source || "",
    importance: meta.importance || "",
    confidence: meta.confidence || "",
    excerpt: excerptFrom(body),
    html: markdownToHtml(body),
  };
});

notes.sort((a, b) => `${b.created}${b.title}`.localeCompare(`${a.created}${a.title}`, "ja"));

for (const note of notes) {
  const body = `    <article class="article">
      <nav class="back"><a href="../index.html">← 記事一覧へ</a></nav>
      <div class="meta-row">
        <span>${escapeHtml(note.created)}</span>
        <span>${escapeHtml(note.genreLabel)}</span>
        ${note.importance ? `<span>importance: ${escapeHtml(note.importance)}</span>` : ""}
      </div>
      ${note.html}
      ${
        note.source
          ? `<section class="source-box"><h2>Source</h2><p><a href="${escapeHtml(note.source)}">${escapeHtml(note.source)}</a></p></section>`
          : ""
      }
    </article>`;
  fs.writeFileSync(
    path.join(outArticles, `${note.slug}.html`),
    pageShell({
      title: note.title,
      description: note.excerpt,
      body,
      current: "../",
    }),
  );
}

const cards = notes
  .map(
    (note) => `      <article class="card">
        <div class="meta-row">
          <span>${escapeHtml(note.created)}</span>
          <span>${escapeHtml(note.genreLabel)}</span>
        </div>
        <h2><a href="articles/${note.slug}.html">${escapeHtml(note.title)}</a></h2>
        <p>${escapeHtml(note.excerpt)}</p>
      </article>`,
  )
  .join("\n");

const indexBody = `    <section class="hero">
      <h1>海外技術情報アーカイブ</h1>
      <p>海外のAI、SAP/ERP、セキュリティ動向を日本語で読み返すための個人用アーカイブ。</p>
    </section>
    <section class="toolbar">
      <span><a href="interests/index.html">興味レポートも読む</a></span>
      <span>Redacted public reports</span>
    </section>
    <section class="toolbar">
      <span>${notes.length} notes</span>
      <span>Updated ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
    </section>
    <section class="cards">
${cards || "      <p>まだ記事がありません。</p>"}
    </section>`;

fs.writeFileSync(
  path.join(repoRoot, "index.html"),
  pageShell({
    title: "記事一覧",
    description: "海外技術情報アーカイブの記事一覧",
    body: indexBody,
  }),
);

fs.writeFileSync(
  path.join(outData, "articles.json"),
  JSON.stringify(
    notes.map(({ html, ...note }) => ({
      ...note,
      file: path.relative(notesRoot, note.file),
      url: `articles/${note.slug}.html`,
    })),
    null,
    2,
  ),
);

const interestNotes = walkMarkdown(interestsRoot).map((file) => {
  const raw = redactSensitive(fs.readFileSync(file, "utf8"));
  const [meta, body] = parseFrontMatter(raw);
  const category = redactSensitive(categoryFromInterestFile(file));
  const title = redactSensitive(titleFromMarkdown(body, path.basename(file, ".md")));
  const slug = stableSlug(file, title, category);
  const created = meta.created || path.basename(file).match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";

  return {
    file,
    slug,
    title,
    category,
    created,
    status: meta.status || "",
    type: meta.type || "",
    excerpt: redactSensitive(excerptFrom(body)),
    html: markdownToHtml(body),
  };
});

interestNotes.sort(
  (a, b) =>
    a.category.localeCompare(b.category, "ja") ||
    `${b.created}${b.title}`.localeCompare(`${a.created}${a.title}`, "ja"),
);

const categoryCounts = new Map();
for (const note of interestNotes) {
  categoryCounts.set(note.category, (categoryCounts.get(note.category) || 0) + 1);
}

function interestShell(options) {
  return pageShell({
    ...options,
    current: options.current ?? "../",
    siteTitle: "興味レポート",
    siteSubtitle: "Public redacted interest reports",
    homeHref: "interests/index.html",
  });
}

for (const note of interestNotes) {
  const body = `    <article class="article">
      <nav class="back"><a href="../index.html">← 興味レポート一覧へ</a></nav>
      <div class="meta-row">
        ${note.created ? `<span>${escapeHtml(note.created)}</span>` : ""}
        <span>${escapeHtml(note.category)}</span>
        ${note.type ? `<span>${escapeHtml(note.type)}</span>` : ""}
      </div>
      ${note.html}
    </article>`;

  fs.writeFileSync(
    path.join(outInterestArticles, `${note.slug}.html`),
    interestShell({
      title: note.title,
      description: note.excerpt,
      body,
      current: "../../",
    }),
  );
}

for (const category of [...categoryCounts.keys()].sort((a, b) => a.localeCompare(b, "ja"))) {
  const categorySlug = slugify(category);
  const categoryCards = interestNotes
    .filter((note) => note.category === category)
    .map(
      (note) => `      <article class="card">
        <div class="meta-row">
          ${note.created ? `<span>${escapeHtml(note.created)}</span>` : ""}
          <span>${escapeHtml(note.category)}</span>
        </div>
        <h2><a href="../articles/${note.slug}.html">${escapeHtml(note.title)}</a></h2>
        <p>${escapeHtml(note.excerpt)}</p>
      </article>`,
    )
    .join("\n");

  fs.writeFileSync(
    path.join(outInterestCategories, `${categorySlug}.html`),
    interestShell({
      title: category,
      description: `${category} の公開用レポート一覧`,
      current: "../../",
      body: `    <section class="hero">
      <p class="back"><a href="../index.html">← 興味レポート一覧へ</a></p>
      <h1>${escapeHtml(category)}</h1>
      <p>${categoryCounts.get(category)}件の公開用レポート。</p>
    </section>
    <section class="cards">
${categoryCards}
    </section>`,
    }),
  );
}

const categoryLinks = [...categoryCounts.entries()]
  .sort(([a], [b]) => a.localeCompare(b, "ja"))
  .map(
    ([category, count]) =>
      `<a class="pill-link" href="categories/${slugify(category)}.html">${escapeHtml(category)} <span>${count}</span></a>`,
  )
  .join("\n        ");

const interestCards = interestNotes
  .map(
    (note) => `      <article class="card">
        <div class="meta-row">
          ${note.created ? `<span>${escapeHtml(note.created)}</span>` : ""}
          <span>${escapeHtml(note.category)}</span>
        </div>
        <h2><a href="articles/${note.slug}.html">${escapeHtml(note.title)}</a></h2>
        <p>${escapeHtml(note.excerpt)}</p>
      </article>`,
  )
  .join("\n");

const interestIndexBody = `    <section class="hero">
      <p class="back"><a href="../index.html">海外技術情報アーカイブへ</a></p>
      <h1>興味レポート</h1>
      <p>資産運用、ポケカ、不動産、SAP、画像処理、OpenClaw/Obsidian運用などの調査レポート。公開用に個人情報、資産額、年収、具体地名、内部パスを伏せています。</p>
    </section>
    <section class="toolbar">
      <span>${interestNotes.length} reports</span>
      <span>Updated ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
    </section>
    <section class="category-nav">
        ${categoryLinks}
    </section>
    <section class="cards">
${interestCards || "      <p>まだ記事がありません。</p>"}
    </section>`;

fs.writeFileSync(
  path.join(outInterests, "index.html"),
  interestShell({
    title: "レポート一覧",
    description: "公開用に伏せ字化した興味レポート一覧",
    body: interestIndexBody,
    current: "../",
  }),
);

fs.writeFileSync(
  path.join(outData, "interest-articles.json"),
  JSON.stringify(
    interestNotes.map(({ html, ...note }) => ({
      ...note,
      file: "[入力元伏せ]",
      url: `interests/articles/${note.slug}.html`,
    })),
    null,
    2,
  ),
);

fs.writeFileSync(
  path.join(outAssets, "style.css"),
  `:root {
  color-scheme: light;
  --bg: #f7f8fb;
  --panel: #ffffff;
  --text: #1f2937;
  --muted: #64748b;
  --line: #d9e1ea;
  --accent: #0f766e;
  --accent-dark: #115e59;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Segoe UI", sans-serif;
  line-height: 1.75;
}

a { color: var(--accent-dark); }

.site-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.92);
  position: sticky;
  top: 0;
  backdrop-filter: blur(10px);
}

.site-title {
  color: var(--text);
  font-weight: 700;
  text-decoration: none;
}

.site-subtitle,
.meta-row,
.toolbar {
  color: var(--muted);
  font-size: 14px;
}

.category-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 18px 0 4px;
}

.pill-link {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text);
  text-decoration: none;
}

.pill-link span {
  color: var(--muted);
}

main {
  width: min(980px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0 56px;
}

.hero {
  padding: 22px 0 26px;
}

.hero h1 {
  margin: 0 0 8px;
  font-size: clamp(30px, 5vw, 48px);
  line-height: 1.15;
}

.hero p {
  max-width: 720px;
  margin: 0;
  color: var(--muted);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.card h2 {
  margin: 8px 0 10px;
  font-size: 20px;
  line-height: 1.35;
}

.card h2 a {
  color: var(--text);
  text-decoration: none;
}

.card h2 a:hover {
  color: var(--accent-dark);
}

.card p {
  margin: 0;
  color: #334155;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-row span {
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #f8fafc;
}

.article {
  max-width: 820px;
  margin: 0 auto;
  padding: 26px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.article h1 {
  margin: 18px 0 22px;
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.2;
}

.article h2 {
  margin-top: 34px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 24px;
}

.article h3 {
  margin-top: 26px;
  font-size: 20px;
}

.article code {
  padding: 2px 5px;
  border-radius: 4px;
  background: #eef2f7;
}

.back {
  margin-bottom: 14px;
}

.source-box {
  margin-top: 36px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fafc;
  word-break: break-word;
}

@media (max-width: 640px) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
    padding: 14px 16px;
  }

  .toolbar {
    flex-direction: column;
  }

  .article {
    padding: 18px;
  }
}
`,
);

console.log(`Built ${notes.length} article(s) from ${notesRoot}`);
