/**
 * app.js
 * 應用程式進入點：狀態管理、視圖路由、API 串接、事件綁定。
 */
(function () {
  'use strict';

  const Students = window.Wayground.Students;
  const Charts = window.Wayground.Charts;
  const Dashboard = window.Wayground.Dashboard;

  const LS_KEYS = {
    apiUrl: 'wayground.apiUrl',
    theme: 'wayground.theme',
    autoRefresh: 'wayground.autoRefresh',
    portalStudent: 'wayground.portalStudent'
  };

  const state = {
    view: 'dashboard',
    model: null,
    rawData: null,
    apiUrl: localStorage.getItem(LS_KEYS.apiUrl) || window.Wayground.DEFAULT_API_URL || '',
    autoRefresh: localStorage.getItem(LS_KEYS.autoRefresh) === 'true',
    autoRefreshTimer: null,
    portalStudent: localStorage.getItem(LS_KEYS.portalStudent) || null,
    portalLoginError: '',
    portalIframeTask: null,
    portalChangePw: { open: false, error: '' },
    filters: {
      global: { query: '', status: null },
      matrix: { query: '', status: null },
      students: { query: '', status: null },
      taskSort: 'dueDate'
    },
    loading: false
  };

  /* ============== DOM refs ============== */
  const $ = (sel) => document.querySelector(sel);
  const views = {
    dashboard: $('#view-dashboard'),
    matrix: $('#view-matrix'),
    tasks: $('#view-tasks'),
    students: $('#view-students'),
    input: $('#view-input'),
    portal: $('#view-portal')
  };
  const stateLoading = $('#stateLoading');
  const stateEmpty = $('#stateEmpty');
  const stateError = $('#stateError');
  const stateErrorMsg = $('#stateErrorMsg');
  const lastSyncEl = $('#lastSync');

  /* ============== Init ============== */
  function init() {
    initTheme();
    bindNav();
    bindTopBar();
    bindModal();
    bindStateActions();
    bindInputForms();
    bindStudentBatchImport();
    bindStudentsTable();
    bindPortal();
    renderInputView();

    if (state.apiUrl) {
      fetchFromApi(state.apiUrl);
    } else {
      showEmpty();
    }

    if (state.autoRefresh && state.apiUrl) startAutoRefresh();
  }

  /* ============== Theme ============== */
  function initTheme() {
    const saved = localStorage.getItem(LS_KEYS.theme);
    const preferred = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(preferred);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(LS_KEYS.theme, theme);
    $('#themeIconSun').classList.toggle('hidden', theme === 'dark');
    $('#themeIconMoon').classList.toggle('hidden', theme !== 'dark');
    if (state.model) {
      // 重新渲染圖表以套用新的 CSS 色彩變數
      requestAnimationFrame(() => Charts.renderAll(state.model));
    }
  }

  /* ============== Navigation ============== */
  function bindNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    $('#menuToggle').addEventListener('click', () => {
      $('#navRail').classList.add('open');
      $('#scrim').classList.add('show');
    });
    $('#scrim').addEventListener('click', closeMobileNav);
  }

  function closeMobileNav() {
    $('#navRail').classList.remove('open');
    $('#scrim').classList.remove('show');
  }

  function switchView(viewName) {
    state.view = viewName;
    Object.entries(views).forEach(([name, node]) => {
      node.classList.toggle('hidden', name !== viewName);
    });
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    closeMobileNav();
    if (viewName === 'input') renderInputView();
    if (viewName === 'portal') renderPortalView();
    if (state.model) renderCurrentView();
  }

  /* ============== Top bar ============== */
  function bindTopBar() {
    $('#globalSearch').addEventListener('input', (e) => {
      const q = e.target.value;
      state.filters.matrix.query = q;
      state.filters.students.query = q;
      if (state.model) renderCurrentView();
    });

    $('#themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    $('#refreshBtn').addEventListener('click', () => {
      if (state.apiUrl) fetchFromApi(state.apiUrl);
      else if (state.rawData) applyData(state.rawData);
      showSnackbar('已重新整理資料');
    });

    $('#settingsBtn').addEventListener('click', openModal);
    $('#connectBtn').addEventListener('click', openModal);
    $('#exportBtn').addEventListener('click', exportCsv);
  }

  /* ============== Settings modal ============== */
  function bindModal() {
    const overlay = $('#settingsModal');
    $('#apiUrlInput').value = state.apiUrl;
    $('#autoRefreshToggle').checked = state.autoRefresh;

    $('#modalCancelBtn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    $('#modalSaveBtn').addEventListener('click', () => {
      const url = $('#apiUrlInput').value.trim();
      const auto = $('#autoRefreshToggle').checked;
      state.autoRefresh = auto;
      localStorage.setItem(LS_KEYS.autoRefresh, String(auto));

      if (!url) {
        showSnackbar('請輸入 Apps Script Web App 網址');
        return;
      }
      state.apiUrl = url;
      localStorage.setItem(LS_KEYS.apiUrl, url);
      closeModal();
      fetchFromApi(url);
      renderInputView();
      auto ? startAutoRefresh() : stopAutoRefresh();
    });

    $('#modalUseDemoBtn').addEventListener('click', () => {
      closeModal();
      loadDemo();
    });
  }

  function openModal() { $('#settingsModal').classList.add('show'); }
  function closeModal() { $('#settingsModal').classList.remove('show'); }

  /* ============== State action buttons ============== */
  function bindStateActions() {
    $('#loadDemoBtn').addEventListener('click', loadDemo);
    $('#retryBtn').addEventListener('click', () => {
      if (state.apiUrl) fetchFromApi(state.apiUrl);
      else loadDemo();
    });
  }

  function loadDemo() {
    const demo = Students.generateDemoData();
    state.apiUrl = '';
    localStorage.removeItem(LS_KEYS.apiUrl);
    applyData(demo);
    renderInputView();
    showSnackbar('已載入示範資料');
  }

  /* ============== Add Data (students / tasks) ============== */
  function bindInputForms() {
    const studentForm = $('#addStudentForm');
    const taskForm = $('#addTaskForm');
    if (!studentForm || !taskForm) return;

    studentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAddSubmit({
        errorEl: $('#addStudentError'),
        submitBtn: $('#addStudentSubmit'),
        buildPayload: () => {
          const name = $('#newStudentName').value.trim();
          if (!name) throw new Error('請輸入學生姓名');
          return {
            action: 'addStudent',
            name: name,
            studentId: $('#newStudentId').value.trim()
          };
        },
        onSuccess: (name) => {
          studentForm.reset();
          showSnackbar('已新增學生：' + name);
        }
      });
    });

    taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAddSubmit({
        errorEl: $('#addTaskError'),
        submitBtn: $('#addTaskSubmit'),
        buildPayload: () => {
          const name = $('#newTaskName').value.trim();
          if (!name) throw new Error('請輸入任務名稱');
          const scoreRaw = $('#newTaskScore').value;
          const link = $('#newTaskLink').value.trim();
          if (link && !/^https?:\/\//i.test(link)) {
            throw new Error('Wayground 連結需以 http:// 或 https:// 開頭');
          }
          return {
            action: 'addTask',
            name: name,
            dueDate: $('#newTaskDue').value,
            totalScore: scoreRaw === '' ? '' : Number(scoreRaw),
            link: link
          };
        },
        onSuccess: (name) => {
          taskForm.reset();
          showSnackbar('已新增任務：' + name);
        }
      });
    });
  }

  async function handleAddSubmit({ buildPayload, errorEl, submitBtn, onSuccess }) {
    hideFieldError(errorEl);

    if (!state.apiUrl) {
      showFieldError(errorEl, '尚未連接 Google Sheet，請先點選右上角「設定」貼上 Apps Script 網址。');
      return;
    }

    let payload;
    try {
      payload = buildPayload();
    } catch (err) {
      showFieldError(errorEl, err.message);
      return;
    }

    setBusy(submitBtn, true);
    try {
      await postToApi(payload);
      onSuccess(payload.name);
      fetchFromApi(state.apiUrl);
    } catch (err) {
      showFieldError(errorEl, err.message);
    } finally {
      setBusy(submitBtn, false);
    }
  }

  async function postToApi(payload) {
    // 使用 text/plain 避免瀏覽器對 Apps Script 發出 CORS 預檢 (preflight) 請求
    const res = await fetch(state.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '新增失敗，請稍後再試');
    return json.result;
  }

  function renderInputView() {
    const hint = $('#inputModeHint');
    if (!hint) return;
    hint.textContent = state.apiUrl
      ? '目前已連接 Google Sheet，新增後會直接寫入並自動重新整理資料。'
      : '目前為示範資料模式，尚未連接 Google Sheet，請先點選右上角「設定」連接後才能新增資料。';
  }

  function showFieldError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
  }
  function hideFieldError(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.remove('show');
  }
  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = busy;
    if (busy) {
      btn.dataset.originalLabel = btn.textContent;
      btn.textContent = '處理中…';
    } else if (btn.dataset.originalLabel) {
      btn.textContent = btn.dataset.originalLabel;
    }
  }

  /* ============== Batch student import (CSV / Excel) ============== */
  let parsedBatchStudents = [];

  function bindStudentBatchImport() {
    const fileInput = $('#studentBatchFile');
    const previewEl = $('#studentBatchPreview');
    const errorEl = $('#addStudentBatchError');
    const submitBtn = $('#addStudentBatchSubmit');
    if (!fileInput || !submitBtn) return;

    fileInput.addEventListener('change', async () => {
      hideFieldError(errorEl);
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
      submitBtn.disabled = true;
      parsedBatchStudents = [];

      const file = fileInput.files[0];
      if (!file) return;

      if (typeof XLSX === 'undefined') {
        showFieldError(errorEl, 'CSV / Excel 解析套件載入失敗，請重新整理頁面後再試一次。');
        return;
      }

      try {
        const rows = await parseSpreadsheetFile(file);
        const students = rowsToStudents(rows);
        if (students.length === 0) {
          throw new Error('檔案中找不到有效的學生姓名，請確認第一欄為姓名。');
        }
        parsedBatchStudents = students;
        renderBatchPreview(previewEl, students);
        submitBtn.disabled = false;
      } catch (err) {
        showFieldError(errorEl, err.message);
      }
    });

    submitBtn.addEventListener('click', async () => {
      if (!parsedBatchStudents.length) return;
      hideFieldError(errorEl);

      if (!state.apiUrl) {
        showFieldError(errorEl, '尚未連接 Google Sheet，請先點選右上角「設定」貼上 Apps Script 網址。');
        return;
      }

      setBusy(submitBtn, true);
      try {
        const result = await postToApi({ action: 'addStudentsBatch', students: parsedBatchStudents });
        const inserted = (result && result.inserted) || 0;
        const skipped = (result && result.skipped) || [];
        let msg = `已匯入 ${inserted} 位學生`;
        if (skipped.length) msg += `，略過 ${skipped.length} 筆重複姓名`;
        showSnackbar(msg);
        fetchFromApi(state.apiUrl);

        fileInput.value = '';
        previewEl.classList.add('hidden');
        previewEl.innerHTML = '';
        parsedBatchStudents = [];
        submitBtn.disabled = true;
      } catch (err) {
        showFieldError(errorEl, err.message);
      } finally {
        setBusy(submitBtn, false);
      }
    });
  }

  function parseSpreadsheetFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
          resolve(rows);
        } catch (err) {
          reject(new Error('無法讀取檔案，請確認為有效的 CSV 或 Excel 檔。'));
        }
      };
      reader.onerror = () => reject(new Error('讀取檔案時發生錯誤。'));
      reader.readAsArrayBuffer(file);
    });
  }

  /** 將試算表原始列資料轉成 {name, studentId} 陣列；自動略過標題列與重複姓名 */
  function rowsToStudents(rows) {
    let dataRows = (rows || []).filter(r => r && String(r[0] || '').trim() !== '');
    if (dataRows.length === 0) return [];

    const headerCandidates = ['name', 'studentname', '姓名', '學生姓名'];
    const firstCell = String(dataRows[0][0] || '').trim().toLowerCase();
    if (headerCandidates.includes(firstCell)) {
      dataRows = dataRows.slice(1);
    }

    const seen = new Set();
    const students = [];
    dataRows.forEach(r => {
      const name = String(r[0] || '').trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      students.push({
        name: name,
        studentId: r[1] !== undefined && r[1] !== null ? String(r[1]).trim() : ''
      });
    });
    return students;
  }

  function renderBatchPreview(container, students) {
    const maxShown = 8;
    const shown = students.slice(0, maxShown);
    const remaining = students.length - shown.length;
    let html = `<strong>偵測到 ${students.length} 位學生</strong><ul>`;
    shown.forEach(s => {
      html += `<li>${escapeHtml(s.name)}${s.studentId ? '（' + escapeHtml(s.studentId) + '）' : ''}</li>`;
    });
    if (remaining > 0) html += `<li>… 其餘 ${remaining} 位</li>`;
    html += '</ul>';
    container.innerHTML = html;
    container.classList.remove('hidden');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ============== Students table (teacher: reset student password) ============== */
  function bindStudentsTable() {
    const table = $('#studentsTable');
    if (!table) return;
    table.addEventListener('click', async (e) => {
      const name = e.target.getAttribute && e.target.getAttribute('data-reset-password');
      if (!name) return;

      if (!state.apiUrl) {
        showSnackbar('尚未連接 Google Sheet，無法重設密碼');
        return;
      }
      const input = window.prompt(
        `設定「${name}」的登入密碼\n（直接留白並確定，可清除自訂密碼、恢復預設密碼＝學號）`, ''
      );
      if (input === null) return; // 使用者取消

      const newPassword = input.trim();
      setBusy(e.target, true);
      try {
        await postToApi({ action: 'setStudentPassword', studentName: name, password: newPassword });
        showSnackbar(newPassword ? `已重設 ${name} 的密碼` : `已將 ${name} 的密碼恢復為預設（學號）`);
        await fetchFromApi(state.apiUrl);
      } catch (err) {
        showSnackbar('設定密碼失敗：' + err.message);
      } finally {
        setBusy(e.target, false);
      }
    });
  }

  /* ============== Student portal (login + self-report score) ============== */
  function renderPortalView() {
    const container = $('#portalContent');
    if (!container) return;
    if (!state.model) {
      container.innerHTML = '<p style="font-size:14px;color:var(--md-on-surface-variant);">請先於右上角「設定」連接 Google Sheet，或載入示範資料，才能登入查看任務。</p>';
      return;
    }
    if (state.portalStudent) {
      Dashboard.renderPortalDashboard(container, state.model, state.portalStudent, {
        iframeTaskName: state.portalIframeTask,
        changePwOpen: state.portalChangePw.open,
        changePwError: state.portalChangePw.error
      });
    } else {
      Dashboard.renderPortalLogin(container, state.model, state.portalLoginError);
    }
  }

  function resetPortalUiState() {
    state.portalLoginError = '';
    state.portalIframeTask = null;
    state.portalChangePw = { open: false, error: '' };
  }

  function bindPortal() {
    const container = $('#portalContent');
    if (!container) return;

    container.addEventListener('submit', (e) => {
      if (e.target.id === 'portalLoginForm') {
        e.preventDefault();
        handlePortalLogin();
        return;
      }
      if (e.target.id === 'portalChangePwForm') {
        e.preventDefault();
        handlePortalChangePassword();
      }
    });

    container.addEventListener('click', (e) => {
      if (e.target.id === 'portalLogoutBtn') {
        state.portalStudent = null;
        localStorage.removeItem(LS_KEYS.portalStudent);
        resetPortalUiState();
        renderPortalView();
        return;
      }

      if (e.target.id === 'portalChangePwToggle') {
        state.portalChangePw.open = !state.portalChangePw.open;
        state.portalChangePw.error = '';
        renderPortalView();
        return;
      }

      const iframeTaskName = e.target.getAttribute && e.target.getAttribute('data-toggle-iframe');
      if (iframeTaskName) {
        const opening = state.portalIframeTask !== iframeTaskName;
        state.portalIframeTask = opening ? iframeTaskName : null;
        if (opening) {
          // 記錄學生開始作答的時間（若後端支援 startTask 動作會寫入 Sheet；
          // 若尚未支援，後端可忽略此呼叫，不影響其餘功能）。
          notifyTaskStarted(iframeTaskName);
        }
        renderPortalView();
        return;
      }

      const taskName = e.target.getAttribute && e.target.getAttribute('data-report-task');
      if (taskName) {
        handlePortalReport(taskName, e.target);
      }
    });
  }

  function handlePortalLogin() {
    const select = $('#portalStudentSelect');
    const pwInput = $('#portalPasswordInput');
    const name = select ? select.value : '';
    const password = pwInput ? pwInput.value : '';

    if (!name) {
      state.portalLoginError = '請選擇你的姓名';
      renderPortalView();
      return;
    }
    if (!password) {
      state.portalLoginError = '請輸入密碼';
      renderPortalView();
      return;
    }
    const student = state.model && state.model.students.find(s => s.name === name);
    if (!student || !Students.verifyPassword(student, password)) {
      state.portalLoginError = '姓名或密碼不正確，第一次登入請使用學號作為密碼。';
      renderPortalView();
      return;
    }

    state.portalStudent = name;
    localStorage.setItem(LS_KEYS.portalStudent, name);
    resetPortalUiState();
    renderPortalView();
  }

  async function handlePortalChangePassword() {
    const oldPw = ($('#portalOldPassword') || {}).value || '';
    const newPw = ($('#portalNewPassword') || {}).value || '';
    const newPw2 = ($('#portalNewPassword2') || {}).value || '';
    const submitBtn = $('#portalChangePwSubmit');

    const student = state.model && state.model.students.find(s => s.name === state.portalStudent);
    if (!student || !Students.verifyPassword(student, oldPw)) {
      state.portalChangePw.error = '目前密碼不正確';
      renderPortalView();
      return;
    }
    if (!newPw || newPw.length < 4) {
      state.portalChangePw.error = '新密碼長度至少需 4 碼';
      renderPortalView();
      return;
    }
    if (newPw !== newPw2) {
      state.portalChangePw.error = '兩次輸入的新密碼不一致';
      renderPortalView();
      return;
    }
    if (!state.apiUrl) {
      state.portalChangePw.error = '尚未連接 Google Sheet，無法儲存密碼';
      renderPortalView();
      return;
    }

    setBusy(submitBtn, true);
    try {
      await postToApi({
        action: 'changePassword',
        studentName: state.portalStudent,
        oldPassword: oldPw,
        newPassword: newPw
      });
      state.portalChangePw = { open: false, error: '' };
      showSnackbar('密碼已更新');
      await fetchFromApi(state.apiUrl);
    } catch (err) {
      state.portalChangePw.error = err.message;
      renderPortalView();
    } finally {
      setBusy(submitBtn, false);
    }
  }

  async function notifyTaskStarted(taskName) {
    if (!state.apiUrl) return;
    try {
      await postToApi({
        action: 'startTask',
        studentName: state.portalStudent,
        taskName: taskName,
        startedAt: new Date().toISOString()
      });
    } catch (err) {
      // 開始作答的紀錄非必要功能，失敗時靜默略過，不打斷學生作答流程。
    }
  }

  async function handlePortalReport(taskName, btn) {
    if (!state.apiUrl) {
      showSnackbar('尚未連接 Google Sheet，無法回報成績');
      return;
    }
    const actionsRow = btn.closest('.portal-task-card__actions');
    const scoreInput = actionsRow ? actionsRow.querySelector('.portal-score-input') : null;
    const scoreRaw = scoreInput ? scoreInput.value.trim() : '';

    setBusy(btn, true);
    try {
      await postToApi({
        action: 'updateRecord',
        studentName: state.portalStudent,
        taskName: taskName,
        status: 'completed',
        score: scoreRaw === '' ? '' : Number(scoreRaw),
        completedAt: new Date().toISOString()
      });
      if (state.portalIframeTask === taskName) state.portalIframeTask = null;
      showSnackbar('已回報完成並記錄時間：' + taskName);
      await fetchFromApi(state.apiUrl);
    } catch (err) {
      showSnackbar('回報失敗：' + err.message);
    } finally {
      setBusy(btn, false);
    }
  }

  /* ============== API ============== */
  async function fetchFromApi(url) {
    showLoading();
    try {
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(url + sep + 'action=getData');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || '未知錯誤');
      applyData(json.data);
    } catch (err) {
      showError(err.message);
    }
  }

  function applyData(rawData) {
    state.rawData = rawData;
    state.model = Students.buildModel(rawData);
    hideStateBlocks();
    renderAll();
    updateLastSync();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    state.autoRefreshTimer = setInterval(() => {
      if (state.apiUrl) fetchFromApi(state.apiUrl);
    }, 60000);
  }
  function stopAutoRefresh() {
    if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }

  function updateLastSync() {
    const now = new Date();
    const label = state.apiUrl ? 'Google Sheet 已連接' : '示範資料模式';
    lastSyncEl.textContent = `${label} · 更新於 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  /* ============== State blocks (loading/empty/error) ============== */
  function showLoading() {
    hideStateBlocks();
    stateLoading.classList.remove('hidden');
    Object.values(views).forEach(v => v.classList.add('hidden'));
  }
  function showEmpty() {
    hideStateBlocks();
    stateEmpty.classList.remove('hidden');
    Object.values(views).forEach(v => v.classList.add('hidden'));
  }
  function showError(msg) {
    hideStateBlocks();
    stateErrorMsg.textContent = msg ? `錯誤訊息：${msg}` : stateErrorMsg.textContent;
    stateError.classList.remove('hidden');
    Object.values(views).forEach(v => v.classList.add('hidden'));
  }
  function hideStateBlocks() {
    stateLoading.classList.add('hidden');
    stateEmpty.classList.add('hidden');
    stateError.classList.add('hidden');
    views[state.view].classList.remove('hidden');
  }

  /* ============== Rendering ============== */
  function renderAll() {
    if (!state.model) return;
    Dashboard.renderStatCards(state.model);
    Charts.renderAll(state.model);
    renderMatrixView();
    renderTasksView();
    renderStudentsView();
    renderPortalView();
  }

  function renderCurrentView() {
    if (!state.model) return;
    if (state.view === 'dashboard') {
      Dashboard.renderStatCards(state.model);
      Charts.renderAll(state.model);
    } else if (state.view === 'matrix') {
      renderMatrixView();
    } else if (state.view === 'tasks') {
      renderTasksView();
    } else if (state.view === 'students') {
      renderStudentsView();
    } else if (state.view === 'portal') {
      renderPortalView();
    }
  }

  function renderMatrixView() {
    const container = $('#matrixFilters');
    Dashboard.renderStatusChips(container, state.filters.matrix.status, (status) => {
      state.filters.matrix.status = status;
      renderMatrixView();
    });
    Dashboard.renderLegend($('#matrixLegend'));
    Dashboard.renderMatrix(state.model, state.filters.matrix);
  }

  function renderTasksView() {
    const container = $('#taskSort');
    container.innerHTML = '';
    const options = [
      ['dueDate', '依截止日排序'],
      ['completionRate', '完成率：低到高'],
      ['completionRateDesc', '完成率：高到低']
    ];
    options.forEach(([key, label]) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (state.filters.taskSort === key ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => {
        state.filters.taskSort = key;
        renderTasksView();
      });
      container.appendChild(chip);
    });
    Dashboard.renderTaskGrid(state.model, { sortBy: state.filters.taskSort });
  }

  function renderStudentsView() {
    const container = $('#studentFilters');
    Dashboard.renderStatusChips(container, state.filters.students.status, (status) => {
      state.filters.students.status = status;
      renderStudentsView();
    });
    Dashboard.renderStudentsTable(state.model, state.filters.students);
  }

  /* ============== Export ============== */
  function exportCsv() {
    if (!state.model) { showSnackbar('尚無資料可匯出'); return; }
    const rows = [['學生姓名', '學號', ...state.model.tasks.map(t => t.name), '整體完成率']];
    state.model.grid.forEach((row, i) => {
      const line = [row.student.name, row.student.studentId || ''];
      row.cells.forEach(c => line.push(Students.STATUS_META[c.status].label));
      line.push(state.model.studentStats[i].completionRate + '%');
      rows.push(line);
    });
    const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wayground-progress-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showSnackbar('已匯出 CSV 檔案');
  }

  function csvEscape(val) {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* ============== Snackbar ============== */
  let snackbarTimer = null;
  function showSnackbar(msg) {
    const bar = $('#snackbar');
    $('#snackbarMsg').textContent = msg;
    bar.classList.add('show');
    clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => bar.classList.remove('show'), 3000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
