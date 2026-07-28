/**
 * students.js
 * 學生 / 任務 / 完成紀錄的資料處理層。
 * 負責：狀態判斷、示範資料產生、彙整統計、搜尋與篩選。
 */
window.Wayground = window.Wayground || {};

(function (W) {
  'use strict';

  const STATUS = {
    COMPLETED: 'completed',
    IN_PROGRESS: 'in_progress',
    DUE_SOON: 'due_soon',
    OVERDUE: 'overdue',
    NOT_STARTED: 'not_started'
  };

  const STATUS_META = {
    completed:   { label: '完成',     color: 'var(--status-complete)',    icon: '✓' },
    in_progress: { label: '進行中',   color: 'var(--status-progress)',    icon: '…' },
    due_soon:    { label: '即將截止', color: 'var(--status-due-soon)',    icon: '!' },
    overdue:     { label: '逾期',     color: 'var(--status-overdue)',     icon: '×' },
    not_started: { label: '未開始',   color: 'var(--status-not-started)', icon: '-' }
  };

  const DUE_SOON_WINDOW_DAYS = 3;

  /** 依照原始紀錄狀態 + 任務截止日，判斷最終顯示狀態（五色燈號） */
  function computeStatus(rawStatus, dueDateStr) {
    const norm = normalizeRawStatus(rawStatus);
    if (norm === STATUS.COMPLETED) return STATUS.COMPLETED;

    const due = parseDate(dueDateStr);
    const now = new Date();

    if (due) {
      const diffDays = (due.setHours(23, 59, 59, 999) - now.getTime()) / 86400000;
      if (diffDays < 0) return STATUS.OVERDUE;
      if (diffDays <= DUE_SOON_WINDOW_DAYS && norm !== STATUS.IN_PROGRESS) return STATUS.DUE_SOON;
      if (diffDays <= DUE_SOON_WINDOW_DAYS && norm === STATUS.IN_PROGRESS) return STATUS.DUE_SOON;
    }

    if (norm === STATUS.IN_PROGRESS) return STATUS.IN_PROGRESS;
    return STATUS.NOT_STARTED;
  }

  function normalizeRawStatus(raw) {
    if (!raw) return STATUS.NOT_STARTED;
    const s = String(raw).trim().toLowerCase();
    if (['completed', 'complete', 'done', '完成'].includes(s)) return STATUS.COMPLETED;
    if (['in_progress', 'in progress', 'progress', '進行中'].includes(s)) return STATUS.IN_PROGRESS;
    return STATUS.NOT_STARTED;
  }

  function parseDate(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  /** 安全轉字串：處理 Google Sheet 可能回傳數字、null、undefined 等非字串型別的儲存格 */
  function toStr(val) {
    if (val === undefined || val === null) return '';
    return String(val).trim();
  }

  /**
   * 將後端回傳的 {students, tasks, records} 組成前端運算用的完整資料模型：
   * - grid: 每位學生 x 每項任務 的狀態矩陣
   * - studentStats: 每位學生的彙總統計
   * - taskStats: 每項任務的彙總統計
   */
  function buildModel(raw) {
    const students = (raw.students || []).map(s => ({
      name: toStr(s.name),
      studentId: toStr(s.studentId),
      // password 為老師或學生自行設定過的密碼；若為空字串，代表尚未設定，
      // 此時有效密碼會 fallback 回學號（見 getEffectivePassword）。
      password: toStr(s.password)
    }));
    const tasks = (raw.tasks || []).map(t => ({
      name: toStr(t.name),
      dueDate: t.dueDate || '',
      totalScore: t.totalScore || null,
      link: toStr(t.link)
    }));
    const records = (raw.records || []).map(r => ({
      studentName: toStr(r.studentName),
      taskName: toStr(r.taskName),
      status: r.status,
      completedAt: r.completedAt,
      score: r.score
    }));

    // 建立快速查找表：studentName|taskName -> record
    const recordMap = new Map();
    records.forEach(r => {
      recordMap.set(r.studentName + '|' + r.taskName, r);
    });

    const grid = students.map(student => {
      const cells = tasks.map(task => {
        const rec = recordMap.get(student.name + '|' + task.name);
        const status = computeStatus(rec && rec.status, task.dueDate);
        return {
          taskName: task.name,
          status: status,
          score: rec ? rec.score : null,
          completedAt: rec ? rec.completedAt : null
        };
      });
      return { student, cells };
    });

    const studentStats = grid.map(row => {
      const counts = countStatuses(row.cells);
      const total = row.cells.length || 1;
      return {
        student: row.student,
        counts: counts,
        completionRate: Math.round((counts.completed / total) * 100)
      };
    });

    const taskStats = tasks.map(task => {
      const cellsForTask = grid.map(row => row.cells.find(c => c.taskName === task.name)).filter(Boolean);
      const counts = countStatuses(cellsForTask);
      const total = cellsForTask.length || 1;
      return {
        task: task,
        counts: counts,
        completionRate: Math.round((counts.completed / total) * 100),
        studentCount: total
      };
    });

    const overallCounts = countStatuses(grid.flatMap(r => r.cells));
    const overallTotal = grid.flatMap(r => r.cells).length || 1;

    return {
      students, tasks, records, grid, studentStats, taskStats,
      overall: {
        counts: overallCounts,
        completionRate: Math.round((overallCounts.completed / overallTotal) * 100),
        studentCount: students.length,
        taskCount: tasks.length
      },
      fetchedAt: raw.fetchedAt || new Date().toISOString()
    };
  }

  function countStatuses(cells) {
    const c = { completed: 0, in_progress: 0, due_soon: 0, overdue: 0, not_started: 0 };
    cells.forEach(cell => { c[cell.status] = (c[cell.status] || 0) + 1; });
    return c;
  }

  /** 依姓名搜尋 + 狀態篩選 學生統計列表 */
  function filterStudentStats(studentStats, query, statusFilter) {
    const q = (query || '').trim().toLowerCase();
    return studentStats.filter(row => {
      const matchesQuery = !q || row.student.name.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || statusFilter === 'all' || row.counts[statusFilter] > 0;
      return matchesQuery && matchesStatus;
    });
  }

  function filterGridRows(grid, query, statusFilter) {
    const q = (query || '').trim().toLowerCase();
    return grid.filter(row => {
      const matchesQuery = !q || row.student.name.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || statusFilter === 'all' ||
        row.cells.some(c => c.status === statusFilter);
      return matchesQuery && matchesStatus;
    });
  }

  /**
   * 取得學生目前的「有效密碼」：
   * - 若曾經設定過自訂密碼（老師重設或學生自行更改），使用該密碼。
   * - 否則預設密碼為學號 (studentId)。
   */
  function getEffectivePassword(student) {
    if (!student) return '';
    return student.password ? student.password : student.studentId;
  }

  /** 是否使用預設密碼（尚未自訂），用於介面上顯示提示 */
  function isUsingDefaultPassword(student) {
    return !!student && !student.password;
  }

  /** 驗證登入密碼是否正確（自訂密碼優先，否則比對學號） */
  function verifyPassword(student, inputPassword) {
    const input = toStr(inputPassword);
    if (!input) return false;
    return input === getEffectivePassword(student);
  }

  function getInitials(name) {
    if (!name) return '?';
    const trimmed = String(name).trim();
    // 中文姓名取最後一個字，英文取前兩個字母
    if (/[\u4e00-\u9fff]/.test(trimmed)) return trimmed.slice(-2);
    return trimmed.slice(0, 2).toUpperCase();
  }

  /** 產生示範資料，讓使用者在尚未連接 Google Sheet 前就能預覽介面 */
  function generateDemoData() {
    const names = [
      '王小明', '陳怡君', '林政宏', '張雅婷', '李承翰', '黃詩涵', '吳建廷', '劉曉萱',
      '蔡博文', '楊子萱', '許育誠', '鄭雅文', '謝宗翰', '洪佳蓉', '賴俊傑', '簡欣怡',
      '周柏宇', '徐婉婷', '曾冠宇', '莊心怡', '范姜宸', '邱郁婷', '潘俊宏', '高子軒'
    ];

    const today = new Date();
    function offsetDate(days) {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }

    const tasks = [
      { name: 'Ch1 光合作用測驗', dueDate: offsetDate(-6), totalScore: 100 },
      { name: 'Ch2 細胞分裂挑戰賽', dueDate: offsetDate(-3), totalScore: 100 },
      { name: 'Ch3 遺傳學小考', dueDate: offsetDate(-1), totalScore: 100 },
      { name: 'Ch4 生態系統任務', dueDate: offsetDate(2), totalScore: 100 },
      { name: 'Ch5 演化論闖關', dueDate: offsetDate(5), totalScore: 100 },
      { name: '期中總複習', dueDate: offsetDate(9), totalScore: 100 }
    ];

    const students = names.map((name, i) => ({ name, studentId: 'S' + String(1001 + i) }));

    const records = [];
    students.forEach((student, si) => {
      tasks.forEach((task, ti) => {
        // 用簡單的偽隨機規則產生多樣化但穩定的示範資料
        const seed = (si * 7 + ti * 13) % 10;
        let status, completedAt, score;
        if (seed <= 4) {
          status = 'completed';
          completedAt = offsetDate(-Math.abs((si + ti) % 5) - 1);
          score = 60 + ((si * 3 + ti * 5) % 41);
        } else if (seed <= 6) {
          status = 'in_progress';
          score = '';
        } else {
          status = 'not_started';
          score = '';
        }
        records.push({
          studentName: student.name,
          taskName: task.name,
          status: status,
          completedAt: completedAt || '',
          score: score
        });
      });
    });

    return { students, tasks, records, fetchedAt: new Date().toISOString() };
  }

  W.Students = {
    STATUS,
    STATUS_META,
    computeStatus,
    buildModel,
    filterStudentStats,
    filterGridRows,
    getInitials,
    getEffectivePassword,
    isUsingDefaultPassword,
    verifyPassword,
    generateDemoData
  };
})(window.Wayground);
