/**
 * config.js
 * 預設的 Google Apps Script Web App 網址。
 * 若使用者尚未在「設定」中儲存過其他網址，app.js 會使用這裡的值自動連接，
 * 不需要每次都手動貼上。之後仍可隨時到右上角設定圖示更換。
 */
window.Wayground = window.Wayground || {};
window.Wayground.DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycbzBMwVkkEpoAaTatAaPLvFcivccyPrOVc3lRORLiimxhv6R_CZHlBvu1CXqGFAnBTh5/exec';

/**
 * 「新增資料」頁的教師登入預設帳密。
 * 一旦連接 Google Sheet，實際驗證會改在後端進行（見 apps-script-additions.gs
 * 的 teacherLogin），並會在 Sheet 中自動建立一份「Admins」工作表、
 * 寫入這組預設帳密，之後可直接在 Google Sheet 上修改或新增帳號。
 * 這裡的常數只作為「尚未連接 Google Sheet」時（示範資料模式）的本機備援，
 * 讓老師仍可預覽新增資料頁面的操作流程。
 */
window.Wayground.DEFAULT_TEACHER_CREDENTIALS = {
  username: 'd8600010',
  password: 'jimmy601@hotmail'
};
