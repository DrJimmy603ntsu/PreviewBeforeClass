/**
 * dashboard.js
 * 負責把資料模型 (Wayground.Students.buildModel 的輸出) 畫成 DOM。
 * 純渲染函式，不持有狀態；狀態與事件綁定交給 app.js。
 */
window.Wayground = window.Wayground || {};

(function (W) {
  'use strict';

  const META = W.Students ? W.Students.STATUS_META : {};

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach(c => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* ---------------- Stat cards ---------------- */
  function renderStatCards(model) {
    const grid = document.getElementById('statGrid');
    if (!grid) return;
    const o = model.overall;

    const cards = [
      {
        label: '全班完成率', value: o.completionRate + '%',
        icon: '✓', bg: 'var(--status-complete-bg)', fg: 'var(--status-complete)',
        sub: o.counts.completed + ' / ' + (o.studentCount * o.taskCount) + ' 項任務'
      },
      {
        label: '學生人數', value: String(o.studentCount),
        icon: '👥', bg: 'var(--md-primary-container)', fg: 'var(--md-on-primary-container)',
        sub: '目前追蹤中'
      },
      {
        label: 'Wayground 任務數', value: String(o.taskCount),
        icon: '📋', bg: 'var(--md-tertiary-container)', fg: 'var(--md-on-tertiary-container)',
        sub: '已建立的任務'
      },
      {
        label: '逾期未完成', value: String(o.counts.overdue),
        icon: '!', bg: 'var(--status-overdue-bg)', fg: 'var(--status-overdue)',
        sub: '需要關注的項目'
      }
    ];

    grid.innerHTML = '';
    cards.forEach(c => {
      grid.appendChild(el('div', { class: 'stat-card' }, [
        el('div', { class: 'stat-card__icon', style: `background:${c.bg};color:${c.fg}` }, [c.icon]),
        el('div', { class: 'stat-card__label' }, [c.label]),
        el('div', { class: 'stat-card__value' }, [c.value]),
        el('div', { class: 'stat-card__delta', style: 'color:var(--md-on-surface-variant);font-weight:500;' }, [c.sub])
      ]));
    });
  }

  /* ---------------- Status chips (reusable filter toolbar) ---------------- */
  function renderStatusChips(container, activeStatus, onSelect, includeAll) {
    if (!container) return;
    container.innerHTML = '';
    const options = [];
    if (includeAll !== false) options.push(['all', '全部']);
    Object.keys(META).forEach(key => options.push([key, META[key].label]));

    options.forEach(([key, label]) => {
      const isActive = activeStatus === key || (key === 'all' && !activeStatus);
      const chip = el('button', {
        class: 'chip' + (isActive ? ' active' : ''),
        onclick: () => onSelect(key === 'all' ? null : key)
      }, [
        key !== 'all' ? el('span', { class: 'dot', style: `background:${META[key].color}` }) : null,
        label
      ]);
      container.appendChild(chip);
    });
  }

  function renderLegend(container) {
    if (!container) return;
    container.innerHTML = '';
    Object.keys(META).forEach(key => {
      container.appendChild(el('span', { class: 'legend__item' }, [
        el('span', { class: 'dot', style: `background:${META[key].color}` }),
        META[key].label
      ]));
    });
  }

  /* ---------------- Progress matrix ---------------- */
  function renderMatrix(model, filterState) {
    const table = document.getElementById('matrixTable');
    if (!table) return;
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');

    thead.innerHTML = '<th>學生</th>';
    model.tasks.forEach(task => {
      const label = truncate(task.name, 14);
      const headerContent = task.link
        ? el('a', { href: task.link, target: '_blank', rel: 'noopener noreferrer', style: 'color:inherit;text-decoration:underline dotted;' }, [label])
        : label;
      thead.appendChild(el('th', { class: 'task-col', title: task.name + (task.link ? '（點選前往 Wayground）' : '') }, [headerContent]));
    });

    const rows = W.Students.filterGridRows(model.grid, filterState.query, filterState.status);

    tbody.innerHTML = '';
    if (rows.length === 0) {
      const tr = el('tr', {}, [
        el('td', { colspan: String(model.tasks.length + 1), style: 'text-align:center;padding:32px;color:var(--md-on-surface-variant);' },
          ['找不到符合條件的學生'])
      ]);
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(row => {
      const tr = el('tr', {}, [
        el('td', {}, [
          el('div', { class: 'student-name-cell' }, [
            el('span', { class: 'avatar' }, [W.Students.getInitials(row.student.name)]),
            el('span', {}, [row.student.name])
          ])
        ])
      ]);
      row.cells.forEach(cell => {
        const meta = META[cell.status];
        tr.appendChild(el('td', {}, [
          el('span', {
            class: 'cell-pill',
            'data-status': cell.status,
            title: `${cell.taskName} — ${meta.label}` + (cell.score ? `（${cell.score} 分）` : '')
          }, [meta.icon])
        ]));
      });
      tbody.appendChild(tr);
    });
  }

  /* ---------------- Task cards ---------------- */
  function renderTaskGrid(model, sortState) {
    const grid = document.getElementById('taskGrid');
    if (!grid) return;

    let stats = [...model.taskStats];
    const sortBy = (sortState && sortState.sortBy) || 'dueDate';
    if (sortBy === 'completionRate') stats.sort((a, b) => a.completionRate - b.completionRate);
    else if (sortBy === 'completionRateDesc') stats.sort((a, b) => b.completionRate - a.completionRate);
    else stats.sort((a, b) => (a.task.dueDate || '').localeCompare(b.task.dueDate || ''));

    grid.innerHTML = '';
    if (stats.length === 0) {
      grid.appendChild(el('div', { class: 'state-block' }, [el('p', {}, ['尚無任務資料'])]));
      return;
    }

    stats.forEach(ts => {
      const rateColor = ts.completionRate >= 70 ? 'var(--status-complete)' :
        ts.completionRate >= 40 ? 'var(--status-progress)' : 'var(--status-overdue)';
      grid.appendChild(el('div', { class: 'task-card' }, [
        el('div', { class: 'task-card__title' }, [ts.task.name]),
        el('div', { class: 'task-card__meta' }, [
          el('span', {}, ['截止：' + (ts.task.dueDate || '未設定')]),
          el('span', {}, [ts.studentCount + ' 位學生'])
        ]),
        el('div', { class: 'progress-track' }, [
          el('div', { class: 'progress-track__fill', style: `width:${ts.completionRate}%;background:${rateColor}` })
        ]),
        el('div', { class: 'task-card__stats' }, [
          el('span', {}, ['完成率 ', el('b', {}, [ts.completionRate + '%'])]),
          el('span', {}, ['已完成 ', el('b', {}, [String(ts.counts.completed)])]),
          el('span', {}, ['逾期 ', el('b', { style: ts.counts.overdue ? 'color:var(--status-overdue)' : '' }, [String(ts.counts.overdue)])])
        ]),
        ts.task.link ? el('a', {
          class: 'btn btn-outlined',
          href: ts.task.link,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: 'margin-top:12px;width:100%;justify-content:center;height:36px;font-size:13px;'
        }, ['前往 Wayground ↗']) : null
      ]));
    });
  }

  /* ---------------- Students table ---------------- */
  function renderStudentsTable(model, filterState) {
    const table = document.getElementById('studentsTable');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';

    const rows = W.Students.filterStudentStats(model.studentStats, filterState.query, filterState.status);

    if (rows.length === 0) {
      tbody.appendChild(el('tr', {}, [
        el('td', { colspan: '7', style: 'text-align:center;padding:32px;color:var(--md-on-surface-variant);' },
          ['找不到符合條件的學生'])
      ]));
      return;
    }

    rows.sort((a, b) => b.completionRate - a.completionRate);

    rows.forEach(row => {
      const overallStatus = row.completionRate === 100 ? 'completed' :
        row.counts.overdue > 0 ? 'overdue' :
        row.completionRate === 0 ? 'not_started' : 'in_progress';
      const meta = META[overallStatus];

      tbody.appendChild(el('tr', {}, [
        el('td', {}, [
          el('div', { class: 'student-name-cell' }, [
            el('span', { class: 'avatar' }, [W.Students.getInitials(row.student.name)]),
            el('span', {}, [row.student.name])
          ])
        ]),
        el('td', {}, [
          el('div', { style: 'display:flex;align-items:center;gap:8px;min-width:140px;' }, [
            el('div', { class: 'progress-track thin', style: 'flex:1' }, [
              el('div', { class: 'progress-track__fill', style: `width:${row.completionRate}%` })
            ]),
            el('span', { class: 'mono', style: 'font-size:12px;min-width:34px;text-align:right;' }, [row.completionRate + '%'])
          ])
        ]),
        el('td', {}, [String(row.counts.completed)]),
        el('td', {}, [String(row.counts.in_progress)]),
        el('td', {}, [String(row.counts.overdue)]),
        el('td', {}, [String(row.counts.not_started)]),
        el('td', {}, [
          el('span', { class: 'status-badge', 'data-status': overallStatus }, [
            el('span', { class: 'dot', style: `background:${meta.color}` }),
            meta.label
          ])
        ])
      ]));
    });
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n) + '…' : str;
  }

  /* ---------------- Student portal ---------------- */
  function renderPortalLogin(container, model) {
    container.innerHTML = '';
    if (!model || !model.students.length) {
      container.appendChild(el('div', { class: 'state-block' }, [
        el('p', {}, ['尚無學生資料，請先請老師連接 Google Sheet 或新增學生名單。'])
      ]));
      return;
    }

    const options = [el('option', { value: '' }, ['請選擇你的姓名…'])];
    model.students.forEach(s => options.push(el('option', { value: s.name }, [s.name])));
    const select = el('select', { class: 'portal-select', id: 'portalStudentSelect' }, options);

    container.appendChild(el('div', { class: 'card card--elevated', style: 'max-width:420px;' }, [
      el('div', { class: 'field' }, [
        el('label', { for: 'portalStudentSelect' }, ['選擇你的姓名']),
        select
      ]),
      el('div', { class: 'form-actions' }, [
        el('button', { class: 'btn btn-filled', id: 'portalLoginBtn' }, ['登入'])
      ])
    ]));
  }

  function renderPortalDashboard(container, model, loggedInName) {
    container.innerHTML = '';
    const row = model.grid.find(r => r.student.name === loggedInName);
    if (!row) {
      container.appendChild(el('div', { class: 'state-block' }, [
        el('p', {}, ['找不到你的資料，可能已被移除，請重新登入或聯絡老師。']),
        el('button', { class: 'btn btn-tonal', id: 'portalLogoutBtn' }, ['重新登入'])
      ]));
      return;
    }
    const stat = model.studentStats.find(s => s.student.name === loggedInName);

    container.appendChild(el('div', { class: 'portal-header' }, [
      el('div', {}, [
        el('div', { style: 'font-size:20px;font-weight:700;font-family:var(--font-display);' }, ['歡迎回來，' + loggedInName]),
        el('div', { style: 'font-size:13px;color:var(--md-on-surface-variant);margin-top:2px;' },
          ['整體完成率 ' + (stat ? stat.completionRate : 0) + '%'])
      ]),
      el('button', { class: 'btn btn-text', id: 'portalLogoutBtn' }, ['登出'])
    ]));

    const list = el('div', { class: 'portal-task-list' });
    row.cells.forEach(cell => {
      const task = model.tasks.find(t => t.name === cell.taskName);
      const meta = META[cell.status];
      const metaLine = '截止：' + (task && task.dueDate ? task.dueDate : '未設定') +
        (cell.score !== null && cell.score !== undefined && cell.score !== '' ? '　已回報成績：' + cell.score : '');

      const actions = el('div', { class: 'portal-task-card__actions' });
      if (task && task.link) {
        actions.appendChild(el('a', {
          class: 'btn btn-outlined portal-btn-sm',
          href: task.link, target: '_blank', rel: 'noopener noreferrer'
        }, ['前往 Wayground ↗']));
      }
      if (cell.status !== 'completed') {
        actions.appendChild(el('input', {
          type: 'number', min: '0', class: 'portal-score-input', placeholder: '分數（選填）'
        }));
        actions.appendChild(el('button', {
          class: 'btn btn-filled portal-btn-sm', 'data-report-task': cell.taskName
        }, ['回報完成']));
      }

      list.appendChild(el('div', { class: 'portal-task-card' }, [
        el('div', { class: 'portal-task-card__top' }, [
          el('span', { class: 'status-badge', 'data-status': cell.status }, [
            el('span', { class: 'dot', style: `background:${meta.color}` }),
            meta.label
          ]),
          el('span', { class: 'portal-task-card__title' }, [cell.taskName])
        ]),
        el('div', { class: 'portal-task-card__meta' }, [metaLine]),
        actions
      ]));
    });

    if (row.cells.length === 0) {
      list.appendChild(el('div', { class: 'state-block' }, [el('p', {}, ['目前還沒有指派任何任務。'])]));
    }
    container.appendChild(list);
  }

  W.Dashboard = {
    renderStatCards,
    renderStatusChips,
    renderLegend,
    renderMatrix,
    renderTaskGrid,
    renderStudentsTable,
    renderPortalLogin,
    renderPortalDashboard
  };
})(window.Wayground);
