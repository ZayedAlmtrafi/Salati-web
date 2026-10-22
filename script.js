// Slati Web — prayer tracker interactions and local data.
// Everything is stored on this device; there is no server or user account.
(() => {
  'use strict';

  // 1. App data and state
  const prayers = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
  // A single stroke style is used for every status icon, and CSS assigns
  // one consistent color to each prayer state across cards and buttons.
  const iconPaths = {
    onTime: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/>',
    late: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    missed: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
    madeup: '<path d="M3.5 10a8.7 8.7 0 0 1 15-4.4L21 8"/><path d="M21 3.8V8h-4.2"/><path d="M20.5 14a8.7 8.7 0 0 1-15 4.4L3 16"/><path d="M3 20.2V16h4.2"/>'
  };
  const statusIcon = status =>
    `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${iconPaths[status]}</svg>`;
  const statusOptions = [
    ['onTime', 'في وقتها'],
    ['late', 'متأخرة'],
    ['missed', 'فائتة'],
    ['madeup', 'تم القضاء']
  ];
  const statusLabels = {
    onTime: 'صليتها في وقتها',
    late: 'صليتها متأخرة',
    missed: 'فاتتني وتنتظر القضاء',
    madeup: 'تم قضاؤها'
  };

  // Keep this key unchanged so existing records are preserved after updating.
  const storageKey = 'salati-monthly-tracker-v1';
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  let filter = 'all';
  let records = {};
  let storageAvailable = true;
  let toastTimer;
  const openDays = new Set();

  // 2. Date and display helpers
  const el = id => document.getElementById(id);
  const monthStr = (y, m) => new Date(y, m, 1).toLocaleDateString(
    'ar-SA-u-ca-gregory', { month: 'long', year: 'numeric' }
  );
  const dayStr = date => date.toLocaleDateString('ar-SA-u-ca-gregory', {
    weekday: 'long'
  });
  const num = value => new Intl.NumberFormat('ar-SA', {
    useGrouping: false
  }).format(value);
  const iso = (y, m, d) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const recordKey = (y, m, d, prayer) => `${iso(y, m, d)}:${prayer}`;
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  // 3. Read and save localStorage records
  try {
    records = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
    if (typeof records !== 'object' || Array.isArray(records)) records = {};
  } catch (error) {
    records = {};
    storageAvailable = false;
  }

  function saveRecords() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(records));
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
    }

    if (!storageAvailable) {
      showToast('الحفظ في المتصفح غير متاح؛ استخدم النسخة الاحتياطية');
    }
  }

  function showToast(message) {
    const toast = el('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function getDayStatuses(day) {
    return prayers.map(prayer => records[recordKey(year, month, day, prayer)] || '');
  }

  // 4. Statistics and missed-prayer list
  // 'late' means the prayer was actually performed, just marked as late.
  // It must not be counted as 'missed' or 'madeup'.
  function getMonthStats() {
    const stats = {
      onTime: 0,
      late: 0,
      missed: 0,
      madeup: 0,
      empty: 0,
      total: daysInMonth(year, month) * prayers.length
    };
    const lateCounts = {};

    for (let day = 1; day <= daysInMonth(year, month); day++) {
      for (const prayer of prayers) {
        const status = records[recordKey(year, month, day, prayer)];

        if (status && Object.prototype.hasOwnProperty.call(stats, status)) {
          stats[status]++;
          if (status === 'late') {
            lateCounts[prayer] = (lateCounts[prayer] || 0) + 1;
          }
        } else {
          stats.empty++;
        }
      }
    }

    return { stats, lateCounts };
  }

  function getAllPendingQada() {
    const validKey = /^\d{4}-\d{2}-\d{2}:(الفجر|الظهر|العصر|المغرب|العشاء)$/;

    return Object.entries(records)
      .filter(([key, status]) => status === 'missed' && validKey.test(key))
      .map(([key]) => {
        const [date, prayer] = key.split(':');
        const [y, m, d] = date.split('-').map(Number);
        const dateObject = new Date(y, m - 1, d);

        // Reject impossible dates in an imported backup.
        if (
          dateObject.getFullYear() !== y ||
          dateObject.getMonth() !== m - 1 ||
          dateObject.getDate() !== d
        ) {
          return null;
        }

        return { date, prayer, dateObject };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // 5. Create a day's HTML (five prayer buttons)
  function buildPrayerRow(day, prayer, status) {
    const label = statusLabels[status] || 'لم تسجل بعد';
    const buttons = statusOptions.map(([option, text]) => {
      const selected = status === option;
      const disabled = option === 'madeup' && !['missed', 'madeup'].includes(status);

      return `
        <button
          class="status ${option} ${selected ? 'selected' : ''} ${disabled ? 'qada-disabled' : ''}"
          data-day="${day}"
          data-prayer="${prayer}"
          data-status="${option}"
          aria-pressed="${selected}"
          ${disabled ? 'disabled title="سجّلها فائتة أولاً"' : ''}
        ><span class="status-icon">${statusIcon(option)}</span><span>${text}</span></button>
      `;
    }).join('');

    return `
      <div class="prayer">
        <div class="prayer-line">
          <span class="prayer-name">${prayer}</span>
          <span class="status-label ${status}">${label}</span>
        </div>
        <div class="choices" role="group" aria-label="حالة صلاة ${prayer}">
          ${buttons}
        </div>
      </div>
    `;
  }

  function buildDayCard(day) {
    const date = new Date(year, month, day);
    const statuses = getDayStatuses(day);
    const isToday =
      now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
    const isOpen = openDays.has(day);
    const completed = statuses.filter(Boolean).length;
    const rows = prayers.map((prayer, index) =>
      buildPrayerRow(day, prayer, statuses[index])
    ).join('');

    const dots = statuses.map(status => `<span class="dot ${status}"></span>`).join('');
    const todayBadge = isToday ? '<span class="today-flag">اليوم</span>' : '';
    const shortMonth = date.toLocaleDateString('ar-SA-u-ca-gregory', { month: 'short' });

    return `
      <article class="day ${isToday ? 'today' : ''} ${isOpen ? 'open' : ''}" data-day="${day}">
        <button class="day-head" data-toggle="${day}" aria-expanded="${isOpen}">
          <span class="day-meta">
            <span class="date-bubble"><strong>${num(day)}</strong><span>${shortMonth}</span></span>
            <span>
              <span class="day-name">${dayStr(date)} ${todayBadge}</span>
              <div class="date-details">${num(completed)} من ٥ صلوات مسجلة</div>
            </span>
          </span>
          <span class="day-right">
            <span class="dots" aria-label="مؤشرات حالة الصلوات">${dots}</span>
            <span class="chevron">⌄</span>
          </span>
        </button>
        <div class="day-body">${rows}</div>
      </article>
    `;
  }

  // 6. Update the interface after any action
  function render() {
    const dayCount = daysInMonth(year, month);
    const { stats, lateCounts } = getMonthStats();
    const pendingQada = getAllPendingQada();

    el('monthTitle').textContent = monthStr(year, month);
    el('monthSub').textContent = `${num(dayCount)} يومًا • ${num(dayCount * 5)} صلاة`;

    const counters = {
      onTime: 'onTimeCount',
      late: 'lateCount',
      missed: 'missedCount',
      madeup: 'madeupCount'
    };
    for (const [status, elementId] of Object.entries(counters)) {
      el(elementId).textContent = num(stats[status]);
    }

    const percent = Math.round(100 * stats.onTime / stats.total);
    el('progressPercent').textContent = `${num(percent)}٪`;
    el('progressFill').style.width = `${percent}%`;
    el('progressNote').textContent =
      `${num(stats.onTime)} في وقتها • ${num(stats.late)} صُلّيت متأخرة • ` +
      `${num(stats.empty)} خانة لم تُسجّل بعد`;

    renderWarning(stats, lateCounts);
    renderDays(dayCount);
    renderQada(pendingQada);

    document.querySelectorAll('.tab').forEach(button => {
      const active = button.dataset.filter === filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderWarning(stats, lateCounts) {
    const warning = el('warning');
    const mostLate = Object.entries(lateCounts).sort((a, b) => b[1] - a[1])[0];

    if (!stats.missed && !mostLate) {
      warning.style.display = 'none';
      return;
    }

    const missedMessage = stats.missed
      ? `لديك ${num(stats.missed)} صلاة مسجلة فائتة وتنتظر القضاء.`
      : '';
    const lateMessage = mostLate
      ? `أكثر صلاة سجلت لها تأخيرًا هذا الشهر: <strong>${mostLate[0]}</strong> ` +
        `(${num(mostLate[1])} مرات). اجعلها أولوية في الأيام القادمة.`
      : '';

    warning.style.display = 'block';
    warning.innerHTML = `<strong>تذكير لطيف:</strong> ${missedMessage} ${lateMessage}`;
  }

  function renderDays(dayCount) {
    const visibleDays = [];

    for (let day = 1; day <= dayCount; day++) {
      const statuses = getDayStatuses(day);
      if (filter === 'unmarked' && !statuses.some(status => !status)) continue;
      if (filter === 'late' && !statuses.includes('late')) continue;
      if (filter === 'missed' && !statuses.includes('missed')) continue;
      visibleDays.push(day);
    }

    el('dayCount').textContent = `${num(visibleDays.length)} يوم`;
    el('days').innerHTML = visibleDays.length
      ? visibleDays.map(buildDayCard).join('')
      : '<div class="empty">لا توجد أيام ضمن هذا التصنيف حاليًا ✨</div>';
  }

  function renderQada(pendingQada) {
    el('qadaIntro').textContent = pendingQada.length
      ? `لديك ${num(pendingQada.length)} صلاة بانتظار القضاء من جميع الأشهر`
      : 'لا توجد صلوات معلّمة «فائتة» في سجلك.';

    el('qadaList').innerHTML = pendingQada.map(({ date, prayer, dateObject }) => `
      <div class="qada-item">
        <span>
          <div class="qada-name">${prayer}</div>
          <div class="qada-date">${dayStr(dateObject)}، ${dateObject.toLocaleDateString(
            'ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }
          )}</div>
        </span>
        <button class="qada-action" data-qada-date="${date}" data-qada-prayer="${prayer}">
          ${statusIcon('madeup')}<span>قضيتها</span>
        </button>
      </div>
    `).join('');
  }

  // 7. Change prayer status and navigate months
  function setStatus(day, prayer, status) {
    const key = recordKey(year, month, day, prayer);
    const oldStatus = records[key] || '';

    // "Made up" should only follow an existing missed-prayer entry.
    if (status === 'madeup' && !['missed', 'madeup'].includes(oldStatus)) return;

    if (status === oldStatus) delete records[key];
    else records[key] = status;

    openDays.add(day);
    saveRecords();
    render();
  }

  function changeMonth(amount) {
    const targetDate = new Date(year, month + amount, 1);
    year = targetDate.getFullYear();
    month = targetDate.getMonth();
    openDays.clear();

    if (year === now.getFullYear() && month === now.getMonth()) {
      openDays.add(now.getDate());
    }

    filter = 'all';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 8. Backups and file exports
  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
  }

  function downloadBackup() {
    const filename = `صلاتي-نسخة-احتياطية-${iso(
      now.getFullYear(), now.getMonth(), now.getDate()
    )}.json`;
    const content = JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      records
    }, null, 2);

    downloadFile(filename, content, 'application/json;charset=utf-8');
    showToast('تم تجهيز النسخة الاحتياطية');
  }

  async function restoreBackup(event) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text());
      if (!backup.records || typeof backup.records !== 'object' ||
          Array.isArray(backup.records)) {
        throw new Error('Invalid backup file');
      }

      const validStatuses = ['onTime', 'late', 'missed', 'madeup'];
      const validKey = /^\d{4}-\d{2}-\d{2}:(الفجر|الظهر|العصر|المغرب|العشاء)$/;
      const cleanedRecords = {};

      for (const [key, status] of Object.entries(backup.records)) {
        if (validKey.test(key) && validStatuses.includes(status)) {
          cleanedRecords[key] = status;
        }
      }

      if (!confirm('سيتم دمج النسخة مع سجلك الحالي. هل تريد المتابعة؟')) return;
      records = { ...records, ...cleanedRecords };
      saveRecords();
      render();
      showToast('تم استعادة السجل بنجاح');
    } catch (error) {
      alert('تعذر استعادة الملف. اختر نسخة احتياطية صحيحة من صلاتي.');
    } finally {
      input.value = '';
    }
  }

  function exportMonthCsv() {
    const rows = [['التاريخ', 'اليوم', ...prayers]];

    for (let day = 1; day <= daysInMonth(year, month); day++) {
      rows.push([
        iso(year, month, day),
        dayStr(new Date(year, month, day)),
        ...getDayStatuses(day).map(status => statusLabels[status] || 'غير محددة')
      ]);
    }

    const csv = rows.map(row => row.map(value =>
      `"${String(value).replaceAll('"', '""')}"`
    ).join(',')).join('\r\n');
    const filename = `صلاتي-${year}-${String(month + 1).padStart(2, '0')}.csv`;
    downloadFile(filename, '\uFEFF' + csv, 'text/csv;charset=utf-8');
    showToast('تم تجهيز ملف الشهر');
  }

  function clearMonth() {
    if (!confirm(`هل تريد حذف سجلات ${monthStr(year, month)} فقط؟ لا يمكن التراجع دون نسخة احتياطية.`)) {
      return;
    }

    for (let day = 1; day <= daysInMonth(year, month); day++) {
      for (const prayer of prayers) {
        delete records[recordKey(year, month, day, prayer)];
      }
    }

    saveRecords();
    render();
    showToast('تم مسح سجلات هذا الشهر');
  }

  // 9. Event listeners
  el('prevMonth').addEventListener('click', () => changeMonth(-1));
  el('nextMonth').addEventListener('click', () => changeMonth(1));
  el('goToday').addEventListener('click', () => {
    year = now.getFullYear();
    month = now.getMonth();
    openDays.clear();
    openDays.add(now.getDate());
    filter = 'all';
    render();
  });

  document.querySelector('.tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;

    filter = button.dataset.filter;
    if (filter === 'missed') {
      for (let day = 1; day <= daysInMonth(year, month); day++) {
        if (getDayStatuses(day).includes('missed')) openDays.add(day);
      }
    }
    render();
  });

  // Event delegation means new day cards don't need new listeners.
  el('days').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.dataset.toggle) {
      const day = Number(button.dataset.toggle);
      if (openDays.has(day)) openDays.delete(day);
      else openDays.add(day);
      render();
      return;
    }

    if (button.dataset.status) {
      setStatus(Number(button.dataset.day), button.dataset.prayer, button.dataset.status);
    }
  });

  el('qadaList').addEventListener('click', event => {
    const button = event.target.closest('[data-qada-date]');
    if (!button) return;

    const key = `${button.dataset.qadaDate}:${button.dataset.qadaPrayer}`;
    if (records[key] !== 'missed') return;

    records[key] = 'madeup';
    saveRecords();
    render();
    showToast('تم تسجيل القضاء، الحمد لله');
  });

  el('backup').addEventListener('click', downloadBackup);
  el('restore').addEventListener('click', () => el('restoreFile').click());
  el('restoreFile').addEventListener('change', restoreBackup);
  el('csv').addEventListener('click', exportMonthCsv);
  el('clearMonth').addEventListener('click', clearMonth);

  // 10. Start the tracker
  if (!storageAvailable) {
    showToast('الحفظ غير مضمون في هذا المتصفح؛ خذ نسخًا احتياطية');
  }
  openDays.add(now.getDate());
  render();
})();

// Install a service worker after the page loads (for offline PWA support).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
