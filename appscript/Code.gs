/**
 * Wayground 學習進度儀表板 - Google Apps Script 後端
 * ------------------------------------------------------------------
 * 部署方式：
 *   1. 開啟 https://script.google.com，新增專案
 *   2. 貼上本檔案內容到 Code.gs
 *   3. 貼上 appsscript.json 內容（透過「專案設定 > 顯示 appsscript.json」）
 *   4. 修改下方 SPREADSHEET_ID 為你自己的 Google Sheet ID
 *   5. 點選「部署 > 新增部署作業 > 網頁應用程式」
 *      - 執行身分：我
 *      - 存取權限：任何人
 *   6. 複製產生的 Web App 網址，貼到前端 js/app.js 的 API_URL
 *
 * Google Sheet 需要三個工作表（分頁名稱需完全相符）：
 *
 * 【Students】學生名單
 *   A: Name        學生姓名
 *   B: StudentID   學號（選填）
 *
 * 【Tasks】任務清單（Wayground 作業／測驗）
 *   A: TaskName    任務名稱
 *   B: DueDate     截止日期 (YYYY-MM-DD)
 *   C: TotalScore  總分（選填）
 *
 * 【Records】完成紀錄
 *   A: StudentName   學生姓名（需對應 Students 分頁）
 *   B: TaskName      任務名稱（需對應 Tasks 分頁）
 *   C: Status        completed / in_progress / not_started
 *   D: CompletedAt   完成時間 (YYYY-MM-DD HH:mm，選填)
 *   E: Score         分數（選填）
 * ------------------------------------------------------------------
 */

// TODO: 換成你自己的 Google Sheet ID（網址中 /d/ 與 /edit 之間的字串）
const SPREADSHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';

const SHEET_NAMES = {
  students: 'Students',
  tasks: 'Tasks',
  records: 'Records'
};

/**
 * 網頁應用程式進入點 (GET)
 * 支援的 action：
 *   ?action=getData   -> 回傳完整資料（學生、任務、紀錄）
 *   ?action=ping      -> 健康檢查
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getData';

    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'Wayground Dashboard API is running' });
    }

    if (action === 'getData') {
      const data = getAllData();
      return jsonResponse({ ok: true, data: data });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

/**
 * 網頁應用程式進入點 (POST)
 * 用於教師在前端手動更新某位學生某項任務的狀態
 * Body (JSON): { studentName, taskName, status, score }
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const result = upsertRecord(body.studentName, body.taskName, body.status, body.score);
    return jsonResponse({ ok: true, result: result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

/** 讀取三個分頁並組成前端需要的 JSON 結構 */
function getAllData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const students = readSheetAsObjects(ss, SHEET_NAMES.students, ['name', 'studentId']);
  const tasks = readSheetAsObjects(ss, SHEET_NAMES.tasks, ['name', 'dueDate', 'totalScore']);
  const records = readSheetAsObjects(ss, SHEET_NAMES.records,
    ['studentName', 'taskName', 'status', 'completedAt', 'score']);

  return {
    students: students,
    tasks: tasks,
    records: records,
    fetchedAt: new Date().toISOString()
  };
}

/** 將指定分頁（含標題列）轉成物件陣列，欄位名稱依 keys 對應欄位順序 */
function readSheetAsObjects(ss, sheetName, keys) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const lastCol = keys.length;
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(function (row) {
      const obj = {};
      keys.forEach(function (key, i) {
        let val = row[i];
        if (val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
        obj[key] = val;
      });
      return obj;
    });
}

/** 新增或更新 Records 分頁中的一筆紀錄 */
function upsertRecord(studentName, taskName, status, score) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAMES.records);
  const lastRow = sheet.getLastRow();

  let targetRow = -1;
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === studentName && values[i][1] === taskName) {
        targetRow = i + 2;
        break;
      }
    }
  }

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  if (targetRow > 0) {
    sheet.getRange(targetRow, 3).setValue(status);
    sheet.getRange(targetRow, 4).setValue(now);
    if (score !== undefined && score !== null) sheet.getRange(targetRow, 5).setValue(score);
    return { updated: true, row: targetRow };
  } else {
    sheet.appendRow([studentName, taskName, status, now, score || '']);
    return { inserted: true, row: sheet.getLastRow() };
  }
}

/** 包裝成 JSON 回應（Apps Script Web App 對 GET 請求預設允許跨網域讀取） */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
