let allLinksData = [];
let currentPage = 1;
const itemsPerPage = 5;
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('linksTableBody');
    if (!tableBody) return;

    fetchLinks();

    // Search filter listener
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            currentPage = 1;
            renderLinksTable();
        });
    }

    // Pagination listeners
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderLinksTable();
        }
    });

    document.getElementById('nextPageBtn').addEventListener('click', () => {
        const filtered = getFilteredLinks();
        const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderLinksTable();
        }
    });
});

async function fetchLinks() {
    const tableBody = document.getElementById('linksTableBody');
    const skeleton = document.getElementById('loadingSkeleton');
    const emptyState = document.getElementById('emptyState');

    if (skeleton) skeleton.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    tableBody.innerHTML = '';

    try {
        const response = await fetch('/api/urls');
        if (!response.ok) throw new Error('Failed to retrieve links from backend.');
        
        const data = await response.json();
        // Support either array or object map from backend storage
        if (Array.isArray(data)) {
            allLinksData = data;
        } else if (typeof data === 'object' && data !== null) {
            allLinksData = Object.keys(data).map(key => ({
                shortCode: key,
                ...data[key]
            }));
        } else {
            allLinksData = [];
        }

        updateDashboardStats();
        renderLinksTable();
    } catch (err) {
        console.error('Error fetching links:', err);
        showToast('Could not load links from server.', 'error');
    } finally {
        if (skeleton) skeleton.classList.add('hidden');
    }
}

function getFilteredLinks() {
    if (!searchQuery) return allLinksData;
    return allLinksData.filter(link => {
        const orig = String(link.longUrl || link.originalUrl || '').toLowerCase();
        const code = String(link.shortCode || link.id || '').toLowerCase();
        return orig.includes(searchQuery) || code.includes(searchQuery);
    });
}

function renderLinksTable() {
    const tableBody = document.getElementById('linksTableBody');
    const emptyState = document.getElementById('emptyState');
    if (!tableBody || !emptyState) return;
    const filtered = getFilteredLinks();

    tableBody.replaceChildren();

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        updatePaginationControls(0);
        return;
    }

    emptyState.classList.add('hidden');

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filtered.slice(start, start + itemsPerPage);

    paginatedItems.forEach(link => {
        const code = String(link.shortCode || link.id || '');
        const originalUrl = String(link.longUrl || link.originalUrl || '#');
        const shortUrl = link.shortUrl || `${window.location.origin}/${encodeURIComponent(code)}`;
        const clicks = link.clicks !== undefined ? link.clicks : 0;
        const createdAt = link.createdAt ? new Date(link.createdAt) : null;
        const createdDate = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString() : 'N/A';

        const tr = document.createElement('tr');
        const originalCell = document.createElement('td');
        const originalLink = document.createElement('a');
        originalLink.className = 'url-trunc';
        originalLink.style.maxWidth = '220px';
        originalLink.style.display = 'inline-block';
        originalLink.textContent = originalUrl;
        originalLink.title = originalUrl;
        try {
            const parsedOriginalUrl = new URL(originalUrl);
            if (['http:', 'https:'].includes(parsedOriginalUrl.protocol)) {
                originalLink.href = parsedOriginalUrl.href;
                originalLink.target = '_blank';
                originalLink.rel = 'noopener noreferrer';
            }
        } catch {
            // Keep malformed legacy URLs as text rather than making them clickable.
        }
        originalCell.appendChild(originalLink);
        tr.appendChild(originalCell);

        const shortCell = document.createElement('td');
        const shortLink = document.createElement('a');
        shortLink.href = shortUrl;
        shortLink.target = '_blank';
        shortLink.rel = 'noopener noreferrer';
        shortLink.className = 'url-trunc';
        shortLink.style.color = 'var(--primary)';
        shortLink.style.fontWeight = '500';
        shortLink.textContent = shortUrl;
        shortCell.appendChild(shortLink);
        tr.appendChild(shortCell);

        const clicksCell = document.createElement('td');
        const clicksValue = document.createElement('strong');
        clicksValue.textContent = clicks;
        clicksCell.appendChild(clicksValue);
        tr.appendChild(clicksCell);
        tr.appendChild(createCell(createdDate));

        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = 'status-badge';
        statusBadge.textContent = 'Active';
        statusCell.appendChild(statusBadge);
        tr.appendChild(statusCell);

        const actionsCell = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'action-buttons';

        const copyButton = createIconButton('Copy Short URL', '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>');
        copyButton.addEventListener('click', () => copyTableUrl(shortUrl));
        actions.appendChild(copyButton);

        const analyticsLink = createIconButton('View Analytics', '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>', 'a');
        analyticsLink.href = `/analytics-view?code=${encodeURIComponent(code)}`;
        actions.appendChild(analyticsLink);

        const deleteButton = createIconButton('Delete Link', '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>', 'button', 'danger');
        deleteButton.addEventListener('click', () => deleteLink(code));
        actions.appendChild(deleteButton);

        actionsCell.appendChild(actions);
        tr.appendChild(actionsCell);
        tableBody.appendChild(tr);
    });

    updatePaginationControls(totalPages);
}

function createCell(text) {
    const cell = document.createElement('td');
    cell.textContent = text;
    return cell;
}

function createIconButton(title, iconMarkup, tagName = 'button', extraClass = '') {
    const element = document.createElement(tagName);
    element.className = `icon-btn ${extraClass}`.trim();
    element.title = title;
    element.setAttribute('aria-label', title);
    if (tagName === 'button') element.type = 'button';
    element.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">${iconMarkup}</svg>`;
    return element;
}

function updatePaginationControls(totalPages) {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const indicator = document.getElementById('pageIndicator');
    if (!prevBtn || !nextBtn) return;

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
    indicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;
}

function updateDashboardStats() {
    const totalLinksEl = document.getElementById('statTotalLinks');
    const totalClicksEl = document.getElementById('statTotalClicks');
    const avgClicksEl = document.getElementById('statAvgClicks');

    if (!totalLinksEl) return;

    const totalLinks = allLinksData.length;
    let totalClicks = 0;

    allLinksData.forEach(link => {
        const clicks = Number(link.clicks);
        if (Number.isFinite(clicks) && clicks > 0) totalClicks += clicks;
    });

    const avgClicks = totalLinks > 0 ? (totalClicks / totalLinks).toFixed(1) : 0;

    totalLinksEl.textContent = totalLinks;
    totalClicksEl.textContent = totalClicks;
    avgClicksEl.textContent = avgClicks;
}

async function copyTableUrl(url) {
    try {
        await navigator.clipboard.writeText(url);
        showToast('Short URL copied to clipboard!', 'success');
    } catch (err) {
        console.error('Clipboard error:', err);
        showToast('Could not copy the short URL.', 'error');
    }
}

async function deleteLink(shortCode) {
    if (!confirm('Are you sure you want to delete this shortened link?')) return;

    try {
        const response = await fetch(`/api/urls/${encodeURIComponent(shortCode)}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete link.');

        showToast('Link deleted successfully', 'success');
        fetchLinks();
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error deleting short link', 'error');
    }
}