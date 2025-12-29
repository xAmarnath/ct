// Utility functions for CloudTorrent

let toastCounter = 0;

function Toast(message, type = 'info') {
    toastCounter++;
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.id = `toast-${toastCounter}`;
    toast.innerHTML = `
        <i class="bi bi-${getToastIcon(type)}"></i>
        <span>${message}</span>
        <button class="btn btn-ghost btn-icon" onclick="this.parentElement.remove()">
            <i class="bi bi-x"></i>
        </button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        const el = document.getElementById(`toast-${toastCounter}`);
        if (el) el.remove();
    }, 4000);
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return 'check-circle-fill';
        case 'error': return 'exclamation-triangle-fill';
        case 'warning': return 'exclamation-circle-fill';
        default: return 'info-circle-fill';
    }
}

// Custom confirm dialog (styled like toast/modal)
function Confirm(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-icon"><i class="bi bi-question-circle"></i></div>
            <div class="confirm-message">${message}</div>
            <div class="confirm-actions">
                <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
                <button class="btn btn-danger" id="confirm-ok">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.querySelector('#confirm-ok').onclick = () => {
        close();
        if (onConfirm) onConfirm();
    };
    overlay.querySelector('#confirm-cancel').onclick = () => {
        close();
        if (onCancel) onCancel();
    };
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            close();
            if (onCancel) onCancel();
        }
    };
}

// Legacy compat
function ToastMessage(message, bg) {
    const typeMap = { 'success': 'success', 'danger': 'error', 'warning': 'warning', 'primary': 'info' };
    Toast(message, typeMap[bg] || 'info');
}

function copyToClipboard(e) {
    const text = e.dataset?.url || e.getAttribute('data-url');
    navigator.clipboard.writeText(text).then(
        () => Toast('Copied to clipboard', 'success'),
        () => Toast('Failed to copy', 'error')
    );
}

function btnHref(e) {
    const path = e.dataset?.path || e.getAttribute('data-path');
    window.location.href = path;
}

function zipDir(e) {
    const path = e.getAttribute('data-path');
    Toast('Creating ZIP archive...', 'info');
    $.ajax({
        url: '/api/zip/' + path,
        type: 'GET',
        dataType: 'json',
        success: function (data) {
            Toast('ZIP created successfully', 'success');
            e.outerHTML = `<button class="btn btn-primary btn-sm" onclick="downloadFile('${data.file}')"><i class="bi bi-download"></i> Download</button>`;
        },
        error: function (err) {
            Toast('Failed to create ZIP: ' + err.responseText, 'error');
        }
    });
}

function downloadFile(path) {
    const a = document.createElement('a');
    a.href = path;
    a.download = path.split('/').pop();
    a.click();
}

// Tab switching
function initTabs() {
    document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(tab.dataset.tab);
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-tab[data-tab]').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === `tab-${tabId}`);
    });
}

// Modal functions
function openModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('file-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('file-modal').classList.remove('active');
}

// Format bytes
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Get status class
function getStatusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('download') || s.includes('active') || s === 'converting') return 'status-downloading';
    if (s.includes('complet')) return 'status-completed';
    if (s.includes('paus') || s.includes('stop')) return 'status-paused';
    if (s.includes('error')) return 'status-error';
    if (s.includes('queue') || s.includes('wait')) return 'status-queued';
    return '';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        document.querySelectorAll('.confirm-overlay').forEach(el => el.remove());
    }
});
