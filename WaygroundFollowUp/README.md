# Wayground 學習進度儀表板

教師用的即時學習進度儀表板，串接 Google Sheet，Material Design 3 介面，支援深色模式與響應式版面。

## 功能

- 📊 Dashboard 首頁：全班完成率、學生數、任務數、逾期提醒、完成率趨勢圖、狀態分佈圖、各任務完成率長條圖
- 🧮 學生進度矩陣：每位學生 × 每項 Wayground 任務的狀態燈號
- 📋 任務統計：每個任務的完成人數、Progress Bar、排序
- 👥 學生清單：搜尋、依狀態篩選、整體完成率排序
- 🌓 深色模式（自動記憶偏好、跟隨系統）
- 📱 完整響應式（手機／平板／桌面）
- 📤 一鍵匯出 CSV
- 🔌 Google Apps Script 後端，直接讀寫 Google Sheet

### 狀態燈號

| 顏色 | 狀態 | 說明 |
|---|---|---|
| 🟢 綠 | 完成 | 已標記為 completed |
| 🟡 黃 | 進行中 | 已開始但未完成，距截止日 > 3 天 |
| 🟠 橘 | 即將截止 | 距截止日 ≤ 3 天且尚未完成 |
| 🔴 紅 | 逾期 | 已超過截止日仍未完成 |
| ⚪ 灰 | 未開始 | 尚無任何紀錄 |

## 專案結構

```
WaygroundDashboard/
├── index.html              主頁面
├── css/style.css            MD3 樣式、RWD、深色模式
├── js/
│   ├── students.js           資料處理層（狀態運算、示範資料、篩選）
│   ├── charts.js              Chart.js 圖表
│   ├── dashboard.js           UI 渲染（卡片／矩陣／任務／學生列表）
│   └── app.js                  狀態管理、路由、API 串接、事件綁定
└── appscript/
    ├── Code.gs                 Apps Script 後端（doGet / doPost）
    └── appsscript.json          Apps Script 專案設定
```

## 快速開始（不接資料，先看介面）

直接用瀏覽器開啟 `index.html`，點選畫面中的「載入示範資料」即可看到完整介面與 24 位示範學生的假資料。

## 部署到 Google Apps Script（正式使用）

### 1. 建立 Google Sheet

建立一份 Google Sheet，內含三個分頁（名稱需完全相符）：

**Students**

| Name | StudentID |
|---|---|
| 王小明 | S1001 |

**Tasks**

| TaskName | DueDate | TotalScore |
|---|---|---|
| Ch1 光合作用測驗 | 2026-08-01 | 100 |

**Records**

| StudentName | TaskName | Status | CompletedAt | Score |
|---|---|---|---|---|
| 王小明 | Ch1 光合作用測驗 | completed | 2026-07-30 10:20 | 92 |

`Status` 欄位可填 `completed` / `in_progress` / 空白（未開始）；系統會依 `DueDate` 自動判斷「即將截止」與「逾期」，不需手動維護。

> 若你的 Wayground CSV 匯出欄位不同，把欄位貼進 Records 分頁前，先依上表欄位順序整理即可；也可以告訴我實際欄位名稱，我可以調整 `Code.gs` 的解析邏輯配合你的原始格式。

### 2. 建立 Apps Script 專案

1. 前往 [script.google.com](https://script.google.com)，新增專案
2. 把 `appscript/Code.gs` 的內容貼到 `Code.gs`
3. 點「專案設定」→ 勾選「在編輯器中顯示 appsscript.json」，貼上 `appscript/appsscript.json` 的內容
4. 修改 `Code.gs` 頂部的 `SPREADSHEET_ID`，改成你的 Google Sheet ID（網址 `/d/` 與 `/edit` 之間那段字串）

### 3. 部署為網頁應用程式

1. 點右上角「部署」→「新增部署作業」→ 類型選「網頁應用程式」
2. 執行身分：**我**
3. 存取權限：**任何人**
4. 部署後複製產生的網址（結尾是 `/exec`）

### 4. 連接前端

1. 用瀏覽器開啟 `index.html`（或上傳到任何靜態網站空間）
2. 點右上角設定圖示（⚙️）
3. 貼上剛剛複製的 Web App 網址，選擇是否開啟「自動更新」
4. 點「儲存並連接」

之後每次開啟頁面都會自動從 Google Sheet 讀取最新資料；也可以點右上角重新整理圖示手動更新。

## 備註

- 前端不需要任何建置工具，純 HTML/CSS/JS，可直接雙擊開啟或放到任何靜態網站託管服務。
- Apps Script Web App 的 GET 請求預設允許跨網域讀取，不需要額外設定 CORS。
- 若要讓教師直接在網頁上修改單一學生的任務狀態並寫回 Sheet，可以呼叫 `Code.gs` 中已經寫好的 `doPost`（`upsertRecord`），目前前端尚未提供操作介面，可依需求擴充。
