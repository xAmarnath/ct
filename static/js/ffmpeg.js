// FFmpeg Video Conversion Manager - WebSocket updates with diff checking

window.ffmpegAvailable = false;
let previousFFmpegData = null;

document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/ffmpeg/status')
        .then(res => res.json())
        .then(data => {
            window.ffmpegAvailable = data.available;
            updateFFmpegUI();
        })
        .catch(() => {
            window.ffmpegAvailable = false;
            updateFFmpegUI();
        });
});

function updateFFmpegUI() {
    const statusBadge = document.getElementById('ffmpeg-status');
    const unavailableMsg = document.getElementById('ffmpeg-unavailable');
    const conversionList = document.getElementById('conversion-list');

    if (window.ffmpegAvailable) {
        if (statusBadge) {
            statusBadge.className = 'feature-badge active';
            statusBadge.innerHTML = '<i class="bi bi-circle-fill"></i> FFmpeg';
        }
        if (unavailableMsg) unavailableMsg.style.display = 'none';
        if (conversionList) conversionList.style.display = 'block';
    } else {
        if (statusBadge) {
            statusBadge.className = 'feature-badge inactive';
            statusBadge.innerHTML = '<i class="bi bi-circle-fill"></i> FFmpeg';
        }
        if (unavailableMsg) unavailableMsg.style.display = 'block';
        if (conversionList) conversionList.style.display = 'none';
    }
}

function renderConversionQueue(jobs) {
    const container = document.getElementById('conversion-list');
    if (!container) return;

    // Check if data changed
    const newData = JSON.stringify(jobs);
    if (previousFFmpegData === newData) return;
    previousFFmpegData = newData;

    if (!jobs || jobs.length === 0) {
        if (!container.querySelector('.empty-state')) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-film"></i>
                    <h3>No Active Conversions</h3>
                    <p>Use the "Convert" button on video files to start converting</p>
                </div>
            `;
        }
        return;
    }

    // Update individual cards
    const existingCards = container.querySelectorAll('.item-card');
    const existingIds = new Set();
    existingCards.forEach(card => {
        if (card.dataset.jobid) existingIds.add(card.dataset.jobid);
    });

    const newIds = new Set(jobs.map(j => j.id));

    // Remove old
    existingCards.forEach(card => {
        if (!newIds.has(card.dataset.jobid)) card.remove();
    });

    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Update or add
    jobs.forEach(job => {
        let card = container.querySelector(`[data-jobid="${job.id}"]`);
        if (card) {
            updateConversionCard(card, job);
        } else {
            const newCard = document.createElement('div');
            newCard.className = 'item-card';
            newCard.dataset.jobid = job.id;
            newCard.innerHTML = createConversionCardContent(job);
            container.appendChild(newCard);
        }
    });
}

function updateConversionCard(card, job) {
    const statusClass = getConversionStatusClass(job.status);
    const progressNum = job.progress || 0;

    const progressFill = card.querySelector('.progress-fill');
    if (progressFill) progressFill.style.width = progressNum + '%';

    const progressInfo = card.querySelector('.progress-info');
    if (progressInfo) {
        progressInfo.innerHTML = `<span>${progressNum.toFixed(1)}%</span><span>${job.output_name}</span>`;
    }

    const statusEl = card.querySelector('.item-status');
    if (statusEl) {
        statusEl.className = `item-status ${statusClass}`;
        statusEl.innerHTML = `<i class="bi bi-${getConversionStatusIcon(job.status)}"></i> ${job.status}`;
    }

    const metaEl = card.querySelector('.item-meta');
    if (metaEl) {
        let html = `<span><i class="bi bi-clock-history"></i> ${formatDuration(job.current_time)} / ${formatDuration(job.duration)}</span>`;
        html += `<span><i class="bi bi-hash"></i> ${job.id}</span>`;
        if (job.speed) html += `<span class="speed-indicator"><i class="bi bi-speedometer2"></i> ${job.speed}</span>`;
        metaEl.innerHTML = html;
    }
}

function createConversionCardContent(job) {
    const statusClass = getConversionStatusClass(job.status);
    const progressNum = job.progress || 0;

    return `
        <div class="item-header">
            <div class="item-info">
                <div class="item-name">${escapeHtml(job.input_name)} <i class="bi bi-arrow-right"></i> <span class="conversion-format">${job.format}</span></div>
                <div class="item-meta">
                    <span><i class="bi bi-clock-history"></i> ${formatDuration(job.current_time)} / ${formatDuration(job.duration)}</span>
                    <span><i class="bi bi-hash"></i> ${job.id}</span>
                    ${job.speed ? `<span class="speed-indicator"><i class="bi bi-speedometer2"></i> ${job.speed}</span>` : ''}
                </div>
            </div>
            <span class="item-status ${statusClass}">
                <i class="bi bi-${getConversionStatusIcon(job.status)}"></i>
                ${job.status}
            </span>
        </div>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressNum}%"></div>
            </div>
            <div class="progress-info">
                <span>${progressNum.toFixed(1)}%</span>
                <span>${job.output_name}</span>
            </div>
        </div>
        <div class="item-actions">
            ${job.status === 'converting' ? `<button class="btn btn-danger btn-sm" onclick="cancelConversion('${job.id}')"><i class="bi bi-x-circle"></i> Cancel</button>` : ''}
            ${['completed', 'cancelled', 'error'].includes(job.status) ? `<button class="btn btn-secondary btn-sm" onclick="removeConversion('${job.id}')"><i class="bi bi-trash3"></i> Remove</button>` : ''}
            ${job.status === 'completed' ? `<button class="btn btn-primary btn-sm" onclick="downloadFile('${job.output_path}')"><i class="bi bi-download"></i> Download</button>` : ''}
        </div>
        ${job.error ? `<div style="color: var(--red); margin-top: 0.5rem; font-size: 0.8rem;"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(job.error)}</div>` : ''}
    `;
}

function getConversionStatusClass(status) {
    switch (status) {
        case 'converting': return 'status-downloading';
        case 'queued': return 'status-queued';
        case 'completed': return 'status-completed';
        case 'cancelled': return 'status-paused';
        case 'error': return 'status-error';
        default: return '';
    }
}

function getConversionStatusIcon(status) {
    switch (status) {
        case 'converting': return 'gear-wide-connected';
        case 'queued': return 'hourglass-split';
        case 'completed': return 'check-circle';
        case 'cancelled': return 'x-circle';
        case 'error': return 'exclamation-circle';
        default: return 'circle';
    }
}

function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function startConversion(path, format = 'mp4') {
    if (!window.ffmpegAvailable) {
        Toast('FFmpeg is not available', 'error');
        return;
    }
    $.ajax({
        url: '/api/ffmpeg/convert',
        type: 'POST',
        data: { path: path, format: format },
        success: function (data) {
            Toast('Conversion started: ' + data.output_name, 'success');
            switchTab('conversions');
        },
        error: function (xhr) {
            Toast('Error: ' + xhr.responseText, 'error');
        }
    });
}

function cancelConversion(jobId) {
    $.post('/api/ffmpeg/cancel', { id: jobId }).done(() => Toast('Conversion cancelled', 'info'));
}

function removeConversion(jobId) {
    $.post('/api/ffmpeg/remove', { id: jobId }).done(() => Toast('Conversion removed', 'success'));
}

function showConvertDialog(filePath) {
    const content = `
        <p style="margin-bottom: 1rem;">Convert video to different format:</p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="startConversion('${filePath}', 'mp4'); closeModal();"><i class="bi bi-file-earmark-play"></i> MP4</button>
            <button class="btn btn-secondary" onclick="startConversion('${filePath}', 'webm'); closeModal();"><i class="bi bi-file-earmark-play"></i> WebM</button>
            <button class="btn btn-secondary" onclick="startConversion('${filePath}', 'mkv'); closeModal();"><i class="bi bi-file-earmark-play"></i> MKV</button>
        </div>
    `;
    openModal('Convert Video', content);
}
