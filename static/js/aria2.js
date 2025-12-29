// Aria2 Download Manager - WebSocket updates with diff checking

window.aria2Available = false;
let previousAria2Data = null;

document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/aria2/status')
        .then(res => res.json())
        .then(data => {
            window.aria2Available = data.available;
            updateAria2UI();
        })
        .catch(() => {
            window.aria2Available = false;
            updateAria2UI();
        });
});

function updateAria2UI() {
    const statusBadge = document.getElementById('aria2-status');
    const unavailableMsg = document.getElementById('aria2-unavailable');
    const downloadList = document.getElementById('download-list');

    if (window.aria2Available) {
        if (statusBadge) {
            statusBadge.className = 'feature-badge active';
            statusBadge.innerHTML = '<i class="bi bi-circle-fill"></i> Aria2';
        }
        if (unavailableMsg) unavailableMsg.style.display = 'none';
        if (downloadList) downloadList.style.display = 'block';
    } else {
        if (statusBadge) {
            statusBadge.className = 'feature-badge inactive';
            statusBadge.innerHTML = '<i class="bi bi-circle-fill"></i> Aria2';
        }
        if (unavailableMsg) unavailableMsg.style.display = 'block';
        if (downloadList) downloadList.style.display = 'none';
    }
}

function updateDownloadCount(count) {
    const badge = document.getElementById('download-count');
    if (badge && badge.textContent !== String(count || 0)) {
        badge.textContent = count || 0;
    }
}

function renderAria2Downloads(downloads) {
    const container = document.getElementById('download-list');
    if (!container) return;

    // Check if data changed
    const newData = JSON.stringify(downloads);
    if (previousAria2Data === newData) return;
    previousAria2Data = newData;

    if (!downloads || downloads.length === 0) {
        if (!container.querySelector('.empty-state')) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-cloud-arrow-down"></i>
                    <h3>No Active Downloads</h3>
                    <p>Paste a URL above to start downloading</p>
                </div>
            `;
        }
        return;
    }

    // Update individual cards
    const existingCards = container.querySelectorAll('.item-card');
    const existingGids = new Set();
    existingCards.forEach(card => {
        if (card.dataset.gid) existingGids.add(card.dataset.gid);
    });

    const newGids = new Set(downloads.map(d => d.gid));

    // Remove old
    existingCards.forEach(card => {
        if (!newGids.has(card.dataset.gid)) card.remove();
    });

    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Update or add
    downloads.forEach((dl, index) => {
        let card = container.querySelector(`[data-gid="${dl.gid}"]`);
        if (card) {
            updateAria2Card(card, dl);
        } else {
            const newCard = document.createElement('div');
            newCard.className = 'item-card';
            newCard.dataset.gid = dl.gid;
            newCard.innerHTML = createDownloadCardContent(dl);
            container.appendChild(newCard);
        }
    });
}

function updateAria2Card(card, dl) {
    const statusClass = getStatusClass(dl.status);
    const progressNum = dl.progress_num || 0;

    const progressFill = card.querySelector('.progress-fill');
    if (progressFill) progressFill.style.width = progressNum + '%';

    const progressInfo = card.querySelector('.progress-info');
    if (progressInfo) {
        progressInfo.innerHTML = `<span>${dl.progress}</span><span>${progressNum.toFixed(1)}% complete</span>`;
    }

    const statusEl = card.querySelector('.item-status');
    if (statusEl) {
        statusEl.className = `item-status ${statusClass}`;
        statusEl.innerHTML = `<i class="bi bi-${getAria2StatusIcon(dl.status)}"></i> ${dl.status}`;
    }

    const metaEl = card.querySelector('.item-meta');
    if (metaEl) {
        let html = `<span><i class="bi bi-hdd"></i> ${formatBytes(dl.completed_length)} / ${formatBytes(dl.total_length)}</span>`;
        html += `<span><i class="bi bi-hash"></i> ${dl.gid}</span>`;
        if (dl.download_speed > 0) html += `<span class="speed-indicator"><i class="bi bi-speedometer2"></i> ${dl.speed}</span>`;
        metaEl.innerHTML = html;
    }
}

function createDownloadCardContent(dl) {
    const statusClass = getStatusClass(dl.status);
    const progressNum = dl.progress_num || 0;

    return `
        <div class="item-header">
            <div class="item-info">
                <div class="item-name">${escapeHtml(dl.name || dl.gid)}</div>
                <div class="item-meta">
                    <span><i class="bi bi-hdd"></i> ${formatBytes(dl.completed_length)} / ${formatBytes(dl.total_length)}</span>
                    <span><i class="bi bi-hash"></i> ${dl.gid}</span>
                    ${dl.download_speed > 0 ? `<span class="speed-indicator"><i class="bi bi-speedometer2"></i> ${dl.speed}</span>` : ''}
                </div>
            </div>
            <span class="item-status ${statusClass}">
                <i class="bi bi-${getAria2StatusIcon(dl.status)}"></i>
                ${dl.status}
            </span>
        </div>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressNum}%"></div>
            </div>
            <div class="progress-info">
                <span>${dl.progress}</span>
                <span>${progressNum.toFixed(1)}% complete</span>
            </div>
        </div>
        <div class="item-actions">
            ${dl.status === 'Downloading' ? `<button class="btn btn-secondary btn-sm" onclick="pauseAria2Download('${dl.gid}')"><i class="bi bi-pause-fill"></i> Pause</button>` : ''}
            ${dl.status === 'Paused' ? `<button class="btn btn-secondary btn-sm" onclick="resumeAria2Download('${dl.gid}')"><i class="bi bi-play-fill"></i> Resume</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="removeAria2Download('${dl.gid}')"><i class="bi bi-trash3"></i> Remove</button>
        </div>
    `;
}

function getAria2StatusIcon(status) {
    const s = status.toLowerCase();
    if (s === 'downloading' || s === 'active') return 'arrow-down-circle';
    if (s === 'completed' || s === 'complete') return 'check-circle';
    if (s === 'paused') return 'pause-circle';
    if (s === 'queued' || s === 'waiting') return 'hourglass-split';
    if (s === 'error') return 'exclamation-circle';
    return 'circle';
}

function addDownload() {
    if (!window.aria2Available) {
        Toast('Aria2 is not available', 'error');
        return;
    }
    const input = document.getElementById('url-input');
    const url = input.value.trim();
    if (!url) {
        Toast('Please enter a URL', 'warning');
        return;
    }
    $.ajax({
        url: '/api/aria2/add',
        type: 'POST',
        data: { url: url },
        success: function (data) {
            Toast('Download added: ' + data.gid, 'success');
            input.value = '';
        },
        error: function (xhr) {
            Toast('Error: ' + xhr.responseText, 'error');
        }
    });
}

function pauseAria2Download(gid) {
    $.post('/api/aria2/pause', { gid: gid }).done(() => Toast('Download paused', 'info'));
}

function resumeAria2Download(gid) {
    $.post('/api/aria2/resume', { gid: gid }).done(() => Toast('Download resumed', 'success'));
}

function removeAria2Download(gid) {
    if (!confirm('Remove this download?')) return;
    $.post('/api/aria2/remove', { gid: gid }).done(() => Toast('Download removed', 'success'));
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('url-input');
    if (input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addDownload(); });
});
