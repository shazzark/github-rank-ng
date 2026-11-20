export function paginate(items, page, pageSize = 50) {
  const pageCount = Math.ceil(items.length / pageSize);
  const requestedPage = Number.isFinite(page) ? Math.floor(page) : 1;
  const currentPage = pageCount === 0 ? 0 : Math.min(Math.max(1, requestedPage), pageCount);
  const start = currentPage === 0 ? 0 : (currentPage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), currentPage, pageCount, total: items.length };
}

export function filterUsers(rows, query) {
  const normalized = query.trim().toLowerCase();
  return rows.filter((row) => row.username.toLowerCase().includes(normalized));
}

export function normalizeUsername(value) {
  const trimmed = String(value ?? '').trim();
  const username = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (!/^(?=.{1,39}$)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(username)) return null;
  return username.toLowerCase();
}

export function findRankedUser(users, input) {
  const username = normalizeUsername(input);
  if (!username) return null;
  return users.find((user) => user.username.toLowerCase() === username) || null;
}

export function pageForUser(users, username, pageSize = 50) {
  const index = users.findIndex((user) => user.username.toLowerCase() === username.toLowerCase());
  return index < 0 ? null : Math.floor(index / pageSize) + 1;
}

export function navigateToRankedUser(users, username, pageSize = 50) {
  const user = findRankedUser(users, username);
  return user ? { user, page: pageForUser(users, user.username, pageSize) } : null;
}

export function shareableRankUrl(currentUrl, username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const url = new URL(currentUrl);
  url.searchParams.set('user', normalized);
  return url.toString();
}

export function safeGitHubUrl(value, hostname) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === hostname ? url.href : null;
  } catch {
    return null;
  }
}

export function contributionStatsAreStale(stats, now = Date.now()) {
  const collectedAt = Date.parse(stats?.collectedAt || '');
  return !Number.isFinite(collectedAt) || now - collectedAt > 7 * 24 * 60 * 60 * 1000;
}

function addLink(container, label, href) {
  const link = document.createElement('a');
  link.textContent = label;
  link.href = href;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  container.append(link);
}

function rankingRow(element) {
  let contributionStats = null;
  try { contributionStats = JSON.parse(element.dataset.contributionStats || 'null'); } catch { /* Invalid generated data is omitted from the detail panel. */ }
  return {
    element,
    username: element.dataset.username || '',
    rank: Number(element.dataset.rank),
    globalRank: Number(element.dataset.globalRank) || null,
    nigeriaRank: Number(element.dataset.nigeriaRank) || null,
    profileUrl: element.dataset.profileUrl || '',
    avatarUrl: element.dataset.avatarUrl || '',
    followers: Number(element.dataset.followers),
    publicRepos: Number(element.dataset.publicRepos),
    contributionStats,
  };
}

function otherRankingUsers() {
  try {
    const data = document.querySelector('#other-ranking-data')?.textContent || '[]';
    return JSON.parse(data).map((user) => ({
      ...user,
      username: String(user.login || '').toLowerCase(),
      globalRank: window.location.pathname.endsWith('users.nigeria.html') ? Number(user.rank) : null,
      nigeriaRank: window.location.pathname.endsWith('users.nigeria.html') ? null : Number(user.rank),
      profileUrl: String(user.html_url || ''),
      avatarUrl: String(user.avatar_url || ''),
      followers: Number(user.followers),
      publicRepos: Number(user.public_repos),
      contributionStats: user.contributionStats || null,
      element: null,
    }));
  } catch {
    return [];
  }
}

function initializeFindRank(rows, showUser) {
  const form = document.querySelector('#find-rank-form');
  const input = document.querySelector('#find-rank-username');
  const result = document.querySelector('#find-rank-result');
  if (!form || !input || !result) return;

  const allUsers = [...rows, ...otherRankingUsers()];
  const currentBoard = window.location.pathname.endsWith('users.nigeria.html') ? 'nigeria' : 'global';

  function renderResult(rawUsername) {
    const normalized = normalizeUsername(rawUsername);
    result.replaceChildren();
    result.hidden = false;
    for (const row of rows) row.element.classList.remove('rank-match');
    if (!normalized) {
      result.textContent = 'Enter a valid GitHub username (letters, numbers, and single hyphens; up to 39 characters).';
      return;
    }

    const match = navigateToRankedUser(allUsers, normalized);
    const user = match?.user || null;
    if (!user) {
      result.textContent = `@${normalized} is not currently ranked on the Global or Nigeria leaderboards. Absence from these lists does not mean someone is not a developer or is not Nigerian.`;
      return;
    }

    const title = document.createElement('h3');
    title.textContent = `Ranking for @${user.username}`;
    result.append(title);

    const profile = document.createElement('div');
    profile.className = 'find-rank-profile';
    const avatarUrl = safeGitHubUrl(user.avatarUrl, 'avatars.githubusercontent.com');
    if (avatarUrl) {
      const avatar = document.createElement('img');
      avatar.src = avatarUrl;
      avatar.alt = `Avatar for @${user.username}`;
      profile.append(avatar);
    }
    const profileUrl = safeGitHubUrl(user.profileUrl, 'github.com');
    if (profileUrl) addLink(profile, `@${user.username} profile`, profileUrl);
    result.append(profile);

    const rankText = document.createElement('p');
    const globalRank = user.globalRank || (currentBoard === 'global' && user.element ? user.rank : null);
    const nigeriaRank = user.nigeriaRank || (currentBoard === 'nigeria' && user.element ? user.rank : null);
    rankText.textContent = `Global rank: ${globalRank ? `#${globalRank}` : 'not listed'} | Nigeria rank: ${nigeriaRank ? `#${nigeriaRank}` : 'not listed'}`;
    result.append(rankText);

    const details = document.createElement('p');
    details.textContent = `Followers: ${user.followers.toLocaleString()} | Public repositories: ${user.publicRepos.toLocaleString()}`;
    result.append(details);

    const stats = user.contributionStats;
    const activity = document.createElement('section');
    activity.className = 'contribution-details';
    const activityTitle = document.createElement('h4');
    activityTitle.textContent = 'Public GitHub activity';
    activity.append(activityTitle);
    if (!stats || stats.availability === 'unavailable' || stats.availability === 'restricted') {
      const unavailable = document.createElement('p');
      unavailable.textContent = stats?.availability === 'restricted'
        ? 'Contribution statistics are unavailable because the public response indicates restricted activity.'
        : 'Contribution statistics have not been collected for this profile.';
      activity.append(unavailable);
    } else {
      const metricNames = [
        ['publicContributionActivity', 'Public contribution activity (12 months)'],
        ['pullRequestsOpened', 'Pull requests opened (12 months)'],
        ['pullRequestsMerged', 'Pull requests merged (from PRs opened in period)'],
        ['issuesOpened', 'Issues opened (12 months)'],
        ['pullRequestsReviewed', 'Pull request review contributions (12 months)'],
        ['externalPublicRepositories', 'External public repositories with activity (12 months)'],
        ['verifiedExternalOpenSourceRepositories', 'Licensed external repositories with commits or merged PRs'],
      ];
      const list = document.createElement('dl');
      for (const [field, label] of metricNames) {
        const term = document.createElement('dt');
        term.textContent = label;
        const value = document.createElement('dd');
        const metric = stats[field];
        value.textContent = Number.isSafeInteger(metric) && metric >= 0 ? metric.toLocaleString() : 'Unavailable';
        list.append(term, value);
      }
      activity.append(list);
      if (stats.availability === 'partial') {
        const partial = document.createElement('p');
        partial.textContent = 'Some statistics could not be verified and are shown as unavailable.';
        activity.append(partial);
      }
    }
    if (stats?.periodStartAt && stats?.periodEndAt) {
      const period = document.createElement('p');
      const dateOptions = { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' };
      period.textContent = `Measurement period (UTC): ${new Date(stats.periodStartAt).toLocaleDateString(undefined, dateOptions)}–${new Date(stats.periodEndAt).toLocaleDateString(undefined, dateOptions)}`;
      activity.append(period);
    }
    if (stats?.collectedAt && Number.isFinite(Date.parse(stats.collectedAt))) {
      const timestamp = document.createElement('p');
      const stale = contributionStatsAreStale(stats);
      timestamp.textContent = `Last successful contribution collection: ${new Date(stats.collectedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC${stale ? ' (stale; older than 7 days)' : ''}`;
      activity.append(timestamp);
    }
    result.append(activity);

    const membership = document.createElement('p');
    const boards = [globalRank ? 'Global' : null, nigeriaRank ? 'Nigeria' : null].filter(Boolean);
    membership.textContent = `Membership: ${boards.join(' and ')} leaderboard${boards.length === 1 ? '' : 's'}.`;
    result.append(membership);

    if (user.element) {
      showUser(user.username);
      const shareUrl = shareableRankUrl(window.location.href, user.username);
      const share = document.createElement('p');
      if (shareUrl) addLink(share, 'Share this rank', shareUrl);
      result.append(share);
    } else {
      const otherPage = currentBoard === 'global' ? 'users.nigeria.html' : 'index.html';
      const boardUrl = new URL(otherPage, window.location.href);
      boardUrl.searchParams.set('user', user.username);
      const linkText = document.createElement('p');
      addLink(linkText, 'Open their leaderboard result', boardUrl.href);
      result.append(linkText);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    renderResult(input.value);
  });

  const sharedUsername = new URL(window.location.href).searchParams.get('user');
  if (sharedUsername) {
    input.value = sharedUsername;
    renderResult(sharedUsername);
  }
}

function initializePagination() {
  const table = document.querySelector('.table-panel tbody');
  const input = document.querySelector('#user-search');
  const nav = document.querySelector('.pagination');
  if (!table || !input || !nav) return;

  const rows = Array.from(table.rows).map(rankingRow);
  const summary = document.querySelector('#result-summary');
  const emptyState = document.querySelector('.empty-search');
  const numbers = nav.querySelector('.page-numbers');
  const indicator = nav.querySelector('.page-indicator');
  const previous = nav.querySelector('[data-page-action="previous"]');
  const next = nav.querySelector('[data-page-action="next"]');
  let page = 1;

  function showUser(username) {
    const target = findRankedUser(rows, username);
    if (!target) return false;
    input.value = '';
    page = pageForUser(rows, target.username) || 1;
    render();
    for (const row of rows) row.element.classList.remove('rank-match');
    target.element.classList.add('rank-match');
    target.element.setAttribute('tabindex', '-1');
    target.element.focus();
    target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

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
  initializeFindRank(rows, showUser);
}

if (typeof document !== 'undefined') initializePagination();
