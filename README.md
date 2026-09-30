# PDF 分割線去除工具 V3 (Web)

純前端 PDF 線條標記與白色覆蓋工具。頁面幾何和儲存格資料以 PDF pt 儲存；顯示時再轉換為左上角原點的畫布座標。

## 功能

- 開啟 PDF 並指定頁碼，例如 `1,3-5`
- 自動抽取垂直線，支援選取、移除標記及拖曳端點
- 每頁提供 Undo / Redo
- 根據線條和表格邊界推算儲存格並輸入文字
- 匯出套用白色覆蓋與文字的 `cleaned_output.pdf`

## 啟動

於本目錄執行：

```powershell
python -m http.server 8000
```

再於瀏覽器開啟 <http://localhost:8000>。請使用本機 HTTP 伺服器，不要直接以 `file://` 開啟 ES module 頁面。

PDF.js 4.0.379、pdf-lib 1.17.1 及 PDF.js worker 已放在 `vendor/`，執行時不需連 jsDelivr。授權文件一併保留於各套件目錄。

## 結構

```text
pdf-line-remover/
├── index.html
├── README.md
├── vendor/
│   ├── pdfjs/
│   └── pdf-lib/
├── css/
│   ├── base.css
│   ├── layout.css
│   └── components.css
└── js/
    ├── main.js
    ├── config.js
    ├── logger.js
    ├── core/
    │   ├── pdf-processor.js
    │   ├── line-detector.js
    │   ├── table-detector.js
    │   ├── text-writer.js
    │   └── history-manager.js
    ├── canvas/
    │   ├── canvas-view.js
    │   └── interactive-line.js
    ├── ui/
    │   ├── toolbar.js
    │   ├── status-bar.js
    │   ├── cell-editor.js
    │   └── toast.js
    └── presenter/
        └── app-presenter.js
```

## 座標處理

PDF 使用左下角作為座標原點，Canvas 使用左上角。線條和儲存格偵測保留 PDF 座標；繪製疊層時以頁面高度轉換 y 座標，輸出時直接使用 PDF 座標。這避免自動抽取的紅線顯示在 PDF 內容的垂直鏡像位置。

文字目前使用內建 Helvetica；含中日韓字元的儲存格會略過並在 Console 留下提示。

## GitHub Pages 部署

1. 將此目錄內容放進 GitHub repository 根目錄。
2. 在 repository 的 **Settings → Pages** 選擇從 `main` 分支的根目錄發布。
3. 等待 Pages 完成部署後，將產生的 `https://<owner>.github.io/<repository>/` 網址分享給同事。

GitHub Pages 網站是公開的；此目錄不應放入 PDF 範例、輸入文件或輸出文件。PDF 由使用者在瀏覽器中選取，程式在瀏覽器端處理並以下載方式輸出。
