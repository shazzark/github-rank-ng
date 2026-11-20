export function paginate(items, page, pageSize = 50) {
  const pageCount = Math.ceil(items.length / pageSize);
  const currentPage = pageCount === 0 ? 0 : Math.min(Math.max(1, page), pageCount);
  const start = currentPage === 0 ? 0 : (currentPage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), currentPage, pageCount, total: items.length };
}

export function filterUsers(rows, query) {
  const normalized = query.trim().toLowerCase();
  return rows.filter((row) => row.username.toLowerCase().includes(normalized));
}

function initializePagination() {
  const table = document.querySelector('.table-panel tbody');
  const input = document.querySelector('#user-search');
  const nav = document.querySelector('.pagination');
  if (!table || !input || !nav) return;

  const rows = Array.from(table.rows).map((element) => ({ element, username: element.dataset.username || '' }));
  const summary = document.querySelector('#result-summary');
  const emptyState = document.querySelector('.empty-search');
  const numbers = nav.querySelector('.page-numbers');
  const indicator = nav.querySelector('.page-indicator');
  const previous = nav.querySelector('[data-page-action="previous"]');
  const next = nav.querySelector('[data-page-action="next"]');
  let page = 1;

  function render() {
    const filtered = filterUsers(rows, input.value);
    const result = paginate(filtered, page);
    page = result.currentPage || 1;
    const visible = new Set(result.items);
    for (const row of rows) row.element.hidden = !visible.has(row);
    summary.textContent = `${result.total.toLocaleString()} results - ${result.pageCount} pages`;
    emptyState.hidden = result.total !== 0;
    nav.hidden = result.total === 0;
    previous.disabled = result.currentPage <= 1;
    next.disabled = result.currentPage >= result.pageCount;
    indicator.textContent = result.pageCount ? `Page ${result.currentPage} of ${result.pageCount}` : 'No pages';
    numbers.replaceChildren();
    for (let number = 1; number <= result.pageCount; number += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(number);
      button.setAttribute('aria-label', `Page ${number}`);
      if (number === result.currentPage) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => { page = number; render(); });
      numbers.append(button);
    }
  }

  input.addEventListener('input', () => { page = 1; render(); });
  previous.addEventListener('click', () => { page -= 1; render(); });
  next.addEventListener('click', () => { page += 1; render(); });
  nav.hidden = false;
  render();
}

if (typeof document !== 'undefined') initializePagination();
