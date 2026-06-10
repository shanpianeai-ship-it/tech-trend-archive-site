# 海外技術情報アーカイブ Site

Obsidian vault の解説ノートと興味レポートを、GitHub Pages で読める静的ブログに変換するためのローカルサイトです。

## 入力元

```text
~/Desktop/Report/海外技術情報アーカイブ/解説ノート/
~/Desktop/Report/興味/
```

## 生成される主なファイル

```text
index.html
articles/*.html
data/articles.json
data/interest-articles.json
interests/index.html
interests/articles/*.html
interests/categories/*.html
assets/style.css
```

`interests/` 配下は公開用に、個人情報、資産額、年収、具体的地名、内部パスを伏せ字化して生成します。元のObsidian Markdownは変更しません。

## ビルド

```bash
node scripts/build.mjs
```

## サイト上だけ記事を非表示にする

Obsidian のMarkdownを残したままGitHub Pagesからだけ消したい記事は、`hidden-articles.json` に指定します。

```json
{
  "all": [],
  "articles": [
    "articles/2026-06-06_GitHub_Copilotのクラウド_ローカルサンドボックス.html"
  ],
  "interests": [],
  "knowledge": []
}
```

指定には、公開URL、`articles/...html` の相対URL、生成slug、元Markdownの相対パス、記事タイトルのいずれかを使えます。編集後に `node scripts/build.mjs` を実行すると、対象記事は一覧、HTML、JSONから除外されます。

## ローカル確認

```bash
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開きます。

## GitHub Pages 公開手順

1. GitHubで空のリポジトリを作る。
2. このフォルダをそのリポジトリへpushする。
3. GitHubのRepository Settingsで Pages を有効化する。
4. Source は `Deploy from a branch`、Branch は `main`、Folder は `/ (root)` を選ぶ。

`gh` CLI が使える環境なら、後から自動pushまで組み込めます。
