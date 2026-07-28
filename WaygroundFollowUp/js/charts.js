/**
 * charts.js
 * 封裝所有 Chart.js 圖表的建立與更新邏輯。
 */
window.Wayground = window.Wayground || {};

(function (W) {
  'use strict';

  const instances = {};

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function themeColors() {
    return {
      text: cssVar('--md-on-surface'),
      textMuted: cssVar('--md-on-surface-variant'),
      grid: cssVar('--md-outline-variant'),
      c1: cssVar('--chart-1'),
      c2: cssVar('--chart-2'),
      c3: cssVar('--chart-3'),
      c4: cssVar('--chart-4'),
      c5: cssVar('--chart-5'),
      complete: cssVar('--status-complete'),
      progress: cssVar('--status-progress'),
      dueSoon: cssVar('--status-due-soon'),
      overdue: cssVar('--status-overdue'),
      notStarted: cssVar('--status-not-started')
    };
  }

  function destroy(key) {
    if (instances[key]) {
      instances[key].destroy();
      delete instances[key];
    }
  }

  /** 依完成時間彙整出每日累積完成率，作為趨勢圖資料來源 */
  function buildTrendSeries(model) {
    const dated = model.records
      .filter(r => r.status === 'completed' && r.completedAt)
      .map(r => r.completedAt.slice(0, 10))
      .sort();

    if (dated.length === 0) return { labels: [], values: [] };

    const uniqueDates = [...new Set(dated)];
    const totalCells = model.grid.reduce((sum, row) => sum + row.cells.length, 0) || 1;

    let cumulative = 0;
    const counts = {};
    dated.forEach(d => { counts[d] = (counts[d] || 0) + 1; });

    const labels = [];
    const values = [];
    uniqueDates.forEach(d => {
      cumulative += counts[d];
      labels.push(formatShortDate(d));
      values.push(Math.round((cumulative / totalCells) * 100));
    });
    return { labels, values };
  }

  function formatShortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function renderTrendChart(model) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    const t = themeColors();
    const { labels, values } = buildTrendSeries(model);

    destroy('trend');
    instances.trend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['尚無資料'],
        datasets: [{
          label: '累積完成率 (%)',
          data: values.length ? values : [0],
          borderColor: t.c1,
          backgroundColor: hexToRgba(t.c1, 0.15),
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: t.c1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: t.textMuted, font: { size: 11 } }, grid: { display: false } },
          y: {
            min: 0, max: 100,
            ticks: { color: t.textMuted, font: { size: 11 }, callback: v => v + '%' },
            grid: { color: t.grid }
          }
        }
      }
    });

    const legendEl = document.getElementById('trendLegend');
    if (legendEl) {
      legendEl.innerHTML = `<span class="legend__item"><span class="dot" style="background:${t.c1}"></span>累積完成率</span>`;
    }
  }

  function renderStatusDonut(model) {
    const ctx = document.getElementById('statusDonut');
    if (!ctx) return;
    const t = themeColors();
    const c = model.overall.counts;

    destroy('donut');
    instances.donut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['完成', '進行中', '即將截止', '逾期', '未開始'],
        datasets: [{
          data: [c.completed, c.in_progress, c.due_soon, c.overdue, c.not_started],
          backgroundColor: [t.complete, t.progress, t.dueSoon, t.overdue, t.notStarted],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: t.text, boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11 } }
          }
        }
      }
    });
  }

  function renderTaskBarChart(model) {
    const ctx = document.getElementById('taskBarChart');
    if (!ctx) return;
    const t = themeColors();
    const labels = model.taskStats.map(ts => ts.task.name);
    const data = model.taskStats.map(ts => ts.completionRate);

    destroy('taskBar');
    instances.taskBar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '完成率 (%)',
          data,
          backgroundColor: data.map(v => v >= 70 ? t.complete : v >= 40 ? t.progress : t.overdue),
          borderRadius: 6,
          maxBarThickness: 40
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: t.textMuted, font: { size: 11 }, autoSkip: false, maxRotation: 30, minRotation: 0 }, grid: { display: false } },
          y: { min: 0, max: 100, ticks: { color: t.textMuted, callback: v => v + '%' }, grid: { color: t.grid } }
        }
      }
    });
  }

  function hexToRgba(hex, alpha) {
    // 支援 hex 或已是 rgb() 的 CSS 變數值
    if (hex.startsWith('rgb')) return hex;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function renderAll(model) {
    if (typeof Chart === 'undefined') {
      console.error('Chart.js 尚未載入，圖表無法顯示（請確認 CDN 連線正常）。');
      return;
    }
    renderTrendChart(model);
    renderStatusDonut(model);
    renderTaskBarChart(model);
  }

  W.Charts = { renderAll, renderTrendChart, renderStatusDonut, renderTaskBarChart };
})(window.Wayground);
