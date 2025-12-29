// File Browser - main.js

let currentPath = window.location.pathname;

document.addEventListener('DOMContentLoaded', () => {
    loadDirectory();
    updateBreadcrumb();
});

function loadDirectory(path) {
    if (!path) {
        path = '/dir' + window.location.pathname.replace('/downloads', '');
    }

    $.ajax({
        url: path,
        type: 'GET',
        dataType: 'json',
        success: function (data) {
            renderFiles(data || []);
        },
        error: function (err) {
            console.error('Error loading directory:', err);
            renderFiles([]);
        }
    });
}

function renderFiles(files) {
    const container = document.getElementById('file-list');
    if (!container) return;

    if (!files || files.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <i class="bi bi-folder2-open"></i>
                <h3>Empty Folder</h3>
                <p>No files or folders here</p>
            </div>
        `;
        return;
    }

    // Sort: folders first, then files
    files.sort((a, b) => {
        if (a.is_dir === 'true' && b.is_dir !== 'true') return -1;
        if (a.is_dir !== 'true' && b.is_dir === 'true') return 1;
        return a.name.localeCompare(b.name);
    });

    container.innerHTML = files.map(file => createFileCard(file)).join('');
}

function createFileCard(file) {
    const isDir = file.is_dir === 'true';
    const iconClass = getFileIconClass(file);
    const fullName = file.name + (file.ext || '');

    return `
        <div class="file-card" onclick="${isDir ? `navigateTo('${file.path}')` : ''}">
            <div class="file-icon ${iconClass}">
                <i class="bi bi-${getFileIcon(file)}"></i>
            </div>
            <div class="file-name">${escapeHtml(fullName)}</div>
            <div class="file-size">${file.size}</div>
            <div class="item-actions" style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05);" onclick="event.stopPropagation()">
                ${renderFileActions(file, isDir)}
            </div>
        </div>
    `;
}

function renderFileActions(file, isDir) {
    let actions = '';

    if (isDir) {
        actions += `<button class="btn btn-secondary btn-sm" onclick="navigateTo('${file.path}')"><i class="bi bi-folder2-open"></i></button>`;
        actions += `<button class="btn btn-secondary btn-sm" onclick="zipDir(this)" data-path="${file.path}"><i class="bi bi-file-zip"></i></button>`;
    } else {
        actions += `<button class="btn btn-primary btn-sm" onclick="downloadFile('${file.path}')"><i class="bi bi-download"></i></button>`;

        if (file.type === 'Video') {
            actions += `<button class="btn btn-secondary btn-sm" onclick="playVideo('${file.path}')"><i class="bi bi-play-fill"></i></button>`;
            if (typeof showConvertDialog === 'function') {
                actions += `<button class="btn btn-secondary btn-sm" onclick="showConvertDialog('${file.path}')"><i class="bi bi-film"></i></button>`;
            }
        } else if (file.type === 'Audio') {
            actions += `<button class="btn btn-secondary btn-sm" onclick="playAudio('${file.path}')"><i class="bi bi-music-note"></i></button>`;
        } else if (file.type === 'Image') {
            actions += `<button class="btn btn-secondary btn-sm" onclick="showImage('${file.path}', '${escapeHtml(file.name)}')"><i class="bi bi-eye"></i></button>`;
        }
    }

    actions += `<button class="btn btn-danger btn-sm" onclick="deleteFile('${file.path}', '${escapeHtml(file.name + (file.ext || ''))}')"><i class="bi bi-trash3"></i></button>`;
    actions += `<button class="btn btn-ghost btn-sm" onclick="copyToClipboard(this)" data-url="${window.location.origin}${file.path}"><i class="bi bi-clipboard"></i></button>`;

    return actions;
}

function getFileIcon(file) {
    if (file.is_dir === 'true') return 'folder-fill';

    switch (file.type) {
        case 'Video': return 'film';
        case 'Audio': return 'music-note-beamed';
        case 'Image': return 'image';
        case 'Archive': return 'file-zip';
        case 'Pdf': return 'file-pdf';
        case 'Text': return 'file-text';
        default: return 'file-earmark';
    }
}

function getFileIconClass(file) {
    if (file.is_dir === 'true') return 'folder';

    switch (file.type) {
        case 'Video': return 'video';
        case 'Audio': return 'audio';
        case 'Image': return 'image';
        case 'Archive': return 'archive';
        default: return 'document';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function navigateTo(path) {
    window.location.href = path;
}

function goBack() {
    const path = window.location.pathname;
    if (path.length > 11) { // More than /downloads/
        const newPath = path.substring(0, path.lastIndexOf('/'));
        window.location.href = newPath || '/downloads/';
    }
}

function updateBreadcrumb() {
    const path = window.location.pathname.replace('/downloads', '');
    const parts = path.split('/').filter(p => p);
    const container = document.getElementById('breadcrumb');

    let html = '<a href="/downloads/"><i class="bi bi-house"></i> Home</a>';
    let currentPath = '/downloads';

    parts.forEach((part, index) => {
        currentPath += '/' + part;
        html += '<span class="separator"><i class="bi bi-chevron-right"></i></span>';

        if (index === parts.length - 1) {
            html += `<span class="current">${decodeURIComponent(part)}</span>`;
        } else {
            html += `<a href="${currentPath}">${decodeURIComponent(part)}</a>`;
        }
    });

    container.innerHTML = html;
}

function downloadFile(path) {
    const a = document.createElement('a');
    a.href = path;
    a.download = path.split('/').pop();
    a.click();
}

function playVideo(path) {
    window.location.href = '/stream' + path;
}

function playAudio(path) {
    // Simple audio player
    const audio = new Audio(path);
    audio.play();
    Toast('Playing: ' + path.split('/').pop(), 'info');
}

function showImage(path, name) {
    document.getElementById('preview-image').src = path;
    document.getElementById('image-title').textContent = name;
    document.getElementById('image-modal').classList.add('active');
}

function closeImageModal() {
    document.getElementById('image-modal').classList.remove('active');
}

function deleteFile(path, name) {
    if (!confirm(`Delete "${name}"?`)) return;

    const apiPath = path.replace('/dir/', '');

    $.ajax({
        url: '/api/deletefile/' + apiPath,
        type: 'GET',
        success: function () {
            Toast('Deleted: ' + name, 'success');
            loadDirectory();
        },
        error: function (err) {
            Toast('Failed to delete: ' + err.responseText, 'error');
        }
    });
}

function createFolder() {
    const name = prompt('Enter folder name:');
    if (!name) return;

    $.ajax({
        url: '/api/create' + window.location.pathname + name,
        type: 'GET',
        success: function () {
            Toast('Folder created: ' + name, 'success');
            loadDirectory();
        },
        error: function (err) {
            Toast('Failed to create folder: ' + err.responseText, 'error');
        }
    });
}

function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('path', window.location.pathname);

    Toast('Uploading: ' + files[0].name, 'info');

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
        .then(response => {
            if (!response.ok) throw new Error('Upload failed');
            Toast('Uploaded: ' + files[0].name, 'success');
            loadDirectory();
        })
        .catch(err => {
            Toast('Upload failed: ' + err.message, 'error');
        });

    event.target.value = '';
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageModal();
    if (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        goBack();
    }
});
