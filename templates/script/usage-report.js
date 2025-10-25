const UsageReportPage = {
  elements: {},

  init() {
    this.cacheElements();
    this.renderCurrentYear();
    this.loadUsage();
  },

  cacheElements() {
    this.elements = {
      tableBody: document.getElementById('usageReportTableBody'),
      loadingRow: document.getElementById('usageReportLoading'),
      emptyRow: document.getElementById('usageReportEmpty'),
      errorRow: document.getElementById('usageReportError'),
      totalDownload: document.getElementById('reportTotalDownload'),
      totalUpload: document.getElementById('reportTotalUpload'),
      period: document.getElementById('reportPeriod'),
    };
  },

  renderCurrentYear() {
    const yearElement = document.getElementById('currentYear');
    if (yearElement) {
      yearElement.textContent = new Date().getFullYear();
    }
  },

  async loadUsage() {
    this.showState('loading');
    try {
      const response = await fetch('/api/daily_usage');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.json();
      this.renderTable(data);
    } catch (error) {
      console.error('Failed to load usage report:', error);
      this.showState('error');
    }
  },

  showState(state) {
    const { loadingRow, emptyRow, errorRow } = this.elements;
    if (loadingRow) loadingRow.classList.toggle('hidden', state !== 'loading');
    if (emptyRow) emptyRow.classList.toggle('hidden', state !== 'empty');
    if (errorRow) errorRow.classList.toggle('hidden', state !== 'error');
  },

  renderTable(data) {
    const rows = Array.isArray(data?.daily_data) ? data.daily_data : [];
    const { tableBody } = this.elements;
    if (!tableBody) return;

    // Remove existing data rows
    tableBody.querySelectorAll('tr[data-row="usage"]').forEach((node) => node.remove());

    if (rows.length === 0) {
      this.showState('empty');
      this.updateSummary(null, null, data);
      return;
    }

    this.showState('data');

    const html = rows
      .map((entry) => {
        const formattedDate = this.formatDate(entry.date);
        const download = entry.download?.formatted ?? '0 B';
        const upload = entry.upload?.formatted ?? '0 B';
        const total = entry.combined?.formatted ?? '0 B';
        const shareValue = entry.combined?.percentage;
        const share =
          typeof shareValue === 'number' && Number.isFinite(shareValue)
            ? `${shareValue.toFixed(1)}%`
            : '0%';

        return `
          <tr data-row="usage">
            <td class="px-4 py-3 whitespace-nowrap">${this.escapeHtml(formattedDate)}</td>
            <td class="px-4 py-3 text-right text-blue-300">${this.escapeHtml(download)}</td>
            <td class="px-4 py-3 text-right text-green-300">${this.escapeHtml(upload)}</td>
            <td class="px-4 py-3 text-right font-semibold">${this.escapeHtml(total)}</td>
            <td class="px-4 py-3 text-right text-gray-400">${this.escapeHtml(share)}</td>
          </tr>
        `;
      })
      .join('');

    tableBody.insertAdjacentHTML('beforeend', html);
    const newest = rows[0]?.date ?? null;
    const oldest = rows[rows.length - 1]?.date ?? newest;
    this.updateSummary(newest, oldest, data);
  },

  updateSummary(newest, oldest, data) {
    const { totalDownload, totalUpload, period } = this.elements;
    if (totalDownload) {
      totalDownload.textContent = data?.total_usage?.download ?? '0 B';
    }
    if (totalUpload) {
      totalUpload.textContent = data?.total_usage?.upload ?? '0 B';
    }
    if (period) {
      if (!newest) {
        period.textContent = '—';
      } else if (!oldest || oldest === newest) {
        period.textContent = this.formatDate(newest);
      } else {
        period.textContent = `${this.formatDate(oldest)} – ${this.formatDate(newest)}`;
      }
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const parsed = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  },

  escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
};

document.addEventListener('DOMContentLoaded', () => UsageReportPage.init());
