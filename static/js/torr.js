// Torrent Manager - WebSocket-based updates with diff checking

let previousTorrentsData = null;

function updateTorrentCount(count) {
  const badge = document.getElementById('torrent-count');
  if (badge && badge.textContent !== String(count || 0)) badge.textContent = count || 0;
  const stat = document.getElementById('stat-downloads');
  if (stat && stat.textContent !== String(count || 0)) stat.textContent = count || 0;
}

function renderTorrents(torrents) {
  const container = document.getElementById('torrent-list');
  if (!container) return;

  const newData = JSON.stringify(torrents);
  if (previousTorrentsData === newData) return;
  previousTorrentsData = newData;

  if (!torrents || torrents.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-magnet"></i>
                <h3>No Active Torrents</h3>
                <p>Paste a magnet link above to start downloading</p>
            </div>
        `;
    return;
  }

  const existingCards = container.querySelectorAll('.item-card');
  const existingUids = new Set();
  existingCards.forEach(card => { if (card.dataset.uid) existingUids.add(card.dataset.uid); });
  const newUids = new Set(torrents.map(t => t.uid));

  existingCards.forEach(card => { if (!newUids.has(card.dataset.uid)) card.remove(); });

  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  torrents.forEach((torrent, index) => {
    let card = container.querySelector(`[data-uid="${torrent.uid}"]`);
    if (card) {
      updateTorrentCard(card, torrent);
    } else {
      const newCard = document.createElement('div');
      newCard.className = 'item-card';
      newCard.dataset.uid = torrent.uid;
      newCard.innerHTML = createTorrentCardContent(torrent);
      container.appendChild(newCard);
    }
  });
}

function updateTorrentCard(card, torrent) {
  const statusClass = getStatusClass(torrent.status);
  const progressNum = parseFloat(torrent.progress) || 0;

  const nameEl = card.querySelector('.item-name');
  if (nameEl && nameEl.textContent !== torrent.name) nameEl.textContent = torrent.name;

  const progressFill = card.querySelector('.progress-fill');
  if (progressFill) progressFill.style.width = progressNum + '%';

  const progressInfo = card.querySelector('.progress-info');
  if (progressInfo) progressInfo.innerHTML = `<span>${torrent.perc}</span><span>${progressNum.toFixed(1)}%</span>`;

  const statusEl = card.querySelector('.item-status');
  if (statusEl) {
    statusEl.className = `item-status ${statusClass}`;
    statusEl.innerHTML = `<i class="bi bi-${getStatusIcon(torrent.status)}"></i> ${torrent.status}`;
  }

  // Update actions (pause/resume button)
  const actionsEl = card.querySelector('.item-actions');
  if (actionsEl) {
    actionsEl.innerHTML = createTorrentActions(torrent);
  }

  const metaEl = card.querySelector('.item-meta');
  if (metaEl) {
    let html = `<span><i class="bi bi-hdd"></i> ${torrent.size}</span>`;
    if (torrent.speed && torrent.speed !== '-/-') html += `<span class="speed-indicator"><i class="bi bi-speedometer2"></i> ${torrent.speed}</span>`;
    if (torrent.eta && torrent.eta !== '0s' && torrent.status === 'Downloading') html += `<span><i class="bi bi-clock"></i> ${torrent.eta}</span>`;
    metaEl.innerHTML = html;
  }
}

function createTorrentCardContent(torrent) {
  const statusClass = getStatusClass(torrent.status);
  const progressNum = parseFloat(torrent.progress) || 0;

  return `
        <div class="item-header">
            <div class="item-info">
                <div class="item-name">${escapeHtml(torrent.name)}</div>
                <div class="item-meta">
                    <span><i class="bi bi-hdd"></i> ${torrent.size}</span>
                    ${torrent.speed && torrent.speed !== '-/-' ? `<span class="speed-indicator"><i class="bi bi-speedometer2"></i> ${torrent.speed}</span>` : ''}
                    ${torrent.eta && torrent.eta !== '0s' && torrent.status === 'Downloading' ? `<span><i class="bi bi-clock"></i> ${torrent.eta}</span>` : ''}
                </div>
            </div>
            <span class="item-status ${statusClass}">
                <i class="bi bi-${getStatusIcon(torrent.status)}"></i>
                ${torrent.status}
            </span>
        </div>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressNum}%"></div>
            </div>
            <div class="progress-info">
                <span>${torrent.perc}</span>
                <span>${progressNum.toFixed(1)}%</span>
            </div>
        </div>
        <div class="item-actions">
            ${createTorrentActions(torrent)}
        </div>
    `;
}

function createTorrentActions(torrent) {
  const status = (torrent.status || '').toLowerCase();
  let html = '';

  html += `<button class="btn btn-secondary btn-sm" onclick="btnHref(this)" data-path="${torrent.path}"><i class="bi bi-folder2-open"></i></button>`;

  // Pause/Resume based on status
  if (status === 'downloading' || status === 'fetching metadata') {
    html += `<button class="btn btn-secondary btn-sm" onclick="pauseTorrent('${torrent.uid}')"><i class="bi bi-pause-fill"></i></button>`;
  } else if (status === 'stopped' || status === 'paused' || status.includes('stop')) {
    html += `<button class="btn btn-primary btn-sm" onclick="resumeTorrent('${torrent.uid}')"><i class="bi bi-play-fill"></i></button>`;
  }

  if (status === 'completed') {
    html += `<button class="btn btn-secondary btn-sm" onclick="zipDir(this)" data-path="${torrent.path}"><i class="bi bi-file-zip"></i></button>`;
  }

  html += `<button class="btn btn-danger btn-sm" onclick="confirmRemoveTorrent('${torrent.uid}')"><i class="bi bi-trash3"></i></button>`;
  html += `<button class="btn btn-ghost btn-sm" onclick="copyToClipboard(this)" data-url="magnet:?xt=urn:btih:${torrent.magnet}"><i class="bi bi-clipboard"></i></button>`;

  return html;
}

function getStatusIcon(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('download')) return 'arrow-down-circle';
  if (s.includes('complet')) return 'check-circle';
  if (s.includes('paus') || s.includes('stop')) return 'pause-circle';
  if (s.includes('metadata')) return 'hourglass-split';
  return 'circle';
}

// API functions with custom confirm
function addTorrent() {
  const input = document.getElementById('magnet-input');
  const magnet = input.value.trim();
  const engine = document.getElementById('torrent-engine')?.value || 'rain';

  if (!magnet) {
    Toast('Please enter a magnet link', 'warning');
    return;
  }

  if (engine === 'aria2' && window.aria2Available) {
    // Use aria2 for magnet
    $.ajax({
      url: '/api/aria2/add',
      type: 'POST',
      data: { url: magnet },
      success: function () {
        Toast('Magnet added via Aria2', 'success');
        input.value = '';
      },
      error: function (xhr) {
        Toast('Error: ' + (xhr.responseText || 'Failed'), 'error');
      }
    });
  } else {
    // Use rain (default)
    $.ajax({
      url: '/api/add',
      type: 'POST',
      data: { magnet: magnet },
      success: function () {
        Toast('Torrent added', 'success');
        input.value = '';
      },
      error: function (xhr) {
        Toast('Error: ' + (xhr.responseText || 'Failed'), 'error');
      }
    });
  }
}

function confirmRemoveTorrent(uid) {
  Confirm('Remove this torrent and its data?', () => {
    $.ajax({
      url: '/api/remove',
      type: 'POST',
      data: { uid: uid },
      success: () => Toast('Torrent removed', 'success'),
      error: (xhr) => Toast('Error: ' + xhr.responseText, 'error')
    });
  });
}

function removeTorrent(uid) {
  confirmRemoveTorrent(uid);
}

function pauseTorrent(uid) {
  $.post('/api/pause', { uid: uid }).done(() => Toast('Paused', 'info'));
}

function resumeTorrent(uid) {
  $.post('/api/resume', { uid: uid }).done(() => Toast('Resumed', 'success'));
}

function startAll() {
  $.post('/api/startall').done(() => Toast('All started', 'success'));
}

function stopAll() {
  $.post('/api/stopall').done(() => Toast('All stopped', 'info'));
}

function removeAll() {
  Confirm('Remove ALL torrents?', () => {
    $.post('/api/removeall').done(() => Toast('All removed', 'success'));
  });
}

// System stats
function loadSystemStats() {
  $.get('/api/status', function (data) {
    [['stat-cpu', data.cpu + ' cores'], ['stat-mem', data.mem], ['stat-disk', data.disk], ['stat-os', data.os + '/' + data.arch], ['stat-downloads', data.downloads]]
      .forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && el.textContent !== val) el.textContent = val;
      });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadSystemStats();
  setInterval(loadSystemStats, 15000);
  const input = document.getElementById('magnet-input');
  if (input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTorrent(); });
});
