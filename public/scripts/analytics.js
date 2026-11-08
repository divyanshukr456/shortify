let clicksChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    const linkSelect = document.getElementById('analyticsLinkSelect');
    if (!linkSelect) return;

    linkSelect.addEventListener('change', async (e) => {
        const code = e.target.value;
        if (!code) {
            document.getElementById('analyticsContent').classList.add('hidden');
            document.getElementById('analyticsEmptyState').classList.remove('hidden');
            return;
        }
        await fetchAndRenderAnalytics(code);
    });

    // Check if URL has query parameter ?code=XYZ
    loadAnalyticsDropdown().then(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const preselectCode = urlParams.get('code');
        if (preselectCode) {
            linkSelect.value = preselectCode;
            if (linkSelect.value) {
                fetchAndRenderAnalytics(preselectCode);
            }
        }
    });
});

async function loadAnalyticsDropdown() {
    const linkSelect = document.getElementById('analyticsLinkSelect');
    try {
        const response = await fetch('/api/urls');
        if (!response.ok) throw new Error('Failed to retrieve links.');
        const data = await response.json();
        
        let linksArray = [];
        if (Array.isArray(data)) {
            linksArray = data;
        } else if (typeof data === 'object' && data !== null) {
            linksArray = Object.keys(data).map(key => ({
                shortCode: key,
                ...data[key]
            }));
        }

        linkSelect.innerHTML = '<option value="">-- Choose a Short Link --</option>';
        linksArray.forEach(link => {
            const code = link.shortCode || link.id;
            const orig = link.longUrl || link.originalUrl || code;
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = `${window.location.host}/${code} -> ${orig}`;
            linkSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('Error loading analytics dropdown:', err);
        showToast('Could not load links for analytics.', 'error');
    }
}

async function fetchAndRenderAnalytics(shortCode) {
    const content = document.getElementById('analyticsContent');
    const emptyState = document.getElementById('analyticsEmptyState');

    try {
        const response = await fetch(`/api/urls/${encodeURIComponent(shortCode)}/stats`);
        if (!response.ok) throw new Error('Analytics data unavailable.');

        const stats = await response.json();

        content.classList.remove('hidden');
        emptyState.classList.add('hidden');

        document.getElementById('analTotalClicks').textContent = stats.clicks !== undefined ? stats.clicks : 0;
        document.getElementById('analFirstClick').textContent = stats.firstClicked ? new Date(stats.firstClicked).toLocaleDateString() : 'N/A';
        document.getElementById('analLatestClick').textContent = stats.lastClicked ? new Date(stats.lastClicked).toLocaleString() : 'No clicks yet';

        renderChart(stats.dailyClicks || { labels: [], data: [] });
    } catch (err) {
        console.error('Analytics error:', err);
        showToast('Could not fetch analytics for this link.', 'error');
        content.classList.add('hidden');
        emptyState.classList.remove('hidden');
    }
}

function renderChart(chartData) {
    const ctx = document.getElementById('clicksChart').getContext('2d');
    
    if (clicksChartInstance) {
        clicksChartInstance.destroy();
    }

    const labels = chartData.labels || ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Today'];
    const dataValues = chartData.data || chartData.values || [0, 0, 0, 0, 0, 0, 0];

    clicksChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Clicks',
                data: dataValues,
                borderColor: '#8B5CF6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3B82F6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(35, 45, 79, 0.5)' },
                    ticks: { color: '#94A3B8' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(35, 45, 79, 0.5)' },
                    ticks: { color: '#94A3B8', precision: 0 }
                }
            }
        }
    });
}