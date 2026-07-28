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
    autoRefresh: 'wayground.autoRefresh'
  };

  const state = {
    view: 'dashboard',
    model: null,
    rawData: null,
    apiUrl: localStorage.getItem(LS_KEYS.apiUrl) || window.Wayground.DEFAULT_API_URL || '',
    autoRefresh: localStorage.getItem(LS_KEYS.autoRefresh) === 'true',
    autoRefreshTimer: null,
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
    input: $('#view-input')
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
          return {
            action: 'addTask',
            name: name,
            dueDate: $('#newTaskDue').value,
            totalScore: scoreRaw === '' ? '' : Number(scoreRaw)
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
