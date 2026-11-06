// Data tables scroll inside their own container so the page never scrolls sideways.
(function () {
  const { h, clear, btn } = SR.ui;

  /**
   * columns: [{ label, align, render(row), sortKey }]. rows: array. Options: rowClass(row),
   * caption (screen reader name), empty (node), pageSize (adds a "Show more" button),
   * sort: { key, dir }, onSort(key).
   */
  function dataTable({ columns, rows, caption, empty, pageSize, rowClass, sort, onSort, testId }) {
    if (!rows.length && empty) return empty;
    const body = h('tbody');
    let shown = 0;
    const footer = h('div', { class: 'table-foot' });

    function showMore() {
      const next = pageSize ? Math.min(rows.length, shown + pageSize) : rows.length;
      for (let i = shown; i < next; i++) body.appendChild(renderRow(rows[i]));
      shown = next;
      paintFooter();
    }

    function renderRow(row) {
      const cls = rowClass ? rowClass(row) : null;
      return h('tr', { class: cls }, columns.map((col) => h('td', { class: col.align === 'right' ? 'num' : null }, col.render(row))));
    }

    function paintFooter() {
      clear(footer);
      if (!pageSize) return;
      footer.appendChild(h('span', { class: 'muted' }, `Showing ${SR.util.formatInt(shown)} of ${SR.util.formatInt(rows.length)}`));
      if (shown < rows.length) footer.appendChild(btn('Show more', { size: 'sm', onClick: showMore }));
    }

    const head = h('thead', null, h('tr', null, columns.map((col) => {
      const ariaSort = sort && col.sortKey === sort.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : null;
      const content = col.sortKey && onSort
        ? h('button', { type: 'button', class: 'th-sort', onClick: () => onSort(col.sortKey) }, col.label, ariaSort ? h('span', { 'aria-hidden': 'true' }, ariaSort === 'ascending' ? ' ↑' : ' ↓') : null)
        : col.label;
      return h('th', { scope: 'col', class: col.align === 'right' ? 'num' : null, 'aria-sort': ariaSort }, content);
    })));
    const table = h('table', { class: 'table' }, caption ? h('caption', { class: 'sr-only' }, caption) : null, head, body);
    showMore();
    return h('div', { class: 'table-block', dataset: testId ? { testid: testId } : undefined },
      h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': caption || 'Table' }, table),
      pageSize ? footer : null);
  }

  Object.assign(SR.ui, { dataTable });
})();
