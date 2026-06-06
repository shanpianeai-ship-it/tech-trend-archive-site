import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const notesRoot = path.resolve(
  process.env.TECH_ARCHIVE_NOTES ||
    path.join(process.env.HOME, "Desktop/Report/海外技術情報アーカイブ/解説ノート"),
);

const outArticles = path.join(repoRoot, "articles");
const outData = path.join(repoRoot, "data");
const outAssets = path.join(repoRoot, "assets");

fs.mkdirSync(outArticles, { recursive: true });
fs.mkdirSync(outData, { recursive: true });
fs.mkdirSync(outAssets, { recursive: true });

for (const file of fs.readdirSync(outArticles)) {
  if (file.endsWith(".html")) fs.unlinkSync(path.join(outArticles, file));
}

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
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
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

function pageShell({ title, description, body, current = "" }) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | 海外技術情報アーカイブ</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="${current}assets/style.css">
</head>
<body>
  <header class="site-header">
    <a class="site-title" href="${current}index.html">海外技術情報アーカイブ</a>
    <span class="site-subtitle">AI / SAP / Security trend notes</span>
  </header>
  <main>
${body}
  </main>
</body>
</html>`;
}

const notes = walkMarkdown(notesRoot).map((file) => {
  const raw = fs.readFileSync(file, "utf8");
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
