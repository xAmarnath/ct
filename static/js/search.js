// Search Torrents - Modernized

document.addEventListener('DOMContentLoaded', () => {
  searchTorrents(); // Load trending on page load

  const input = document.getElementById('search-input');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchTorrents();
    });
  }
});

function searchTorrents() {
  const input = document.getElementById('search-input');
  let query = input ? input.value.trim() : '';

  if (!query) {
    query = 'top100';
    document.getElementById('search-term').textContent = 'Top Trending';
  } else {
    document.getElementById('search-term').textContent = query;
  }

  const container = document.getElementById('search-results');
  container.innerHTML = `
        <div class="empty-state">
            <i class="bi bi-hourglass-split"></i>
            <h3>Searching...</h3>
        </div>
    `;

  $.ajax({
    url: '/api/search?q=' + encodeURIComponent(query),
    type: 'GET',
    dataType: 'json',
    success: function (data) {
      document.getElementById('result-count').textContent = data.length;
      renderSearchResults(data);
    },
    error: function (err) {
      console.error('Search error:', err);
      container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h3>Search Failed</h3>
                    <p>Could not fetch results. Try again later.</p>
                </div>
            `;
    }
  });
}

function renderSearchResults(results) {
  const container = document.getElementById('search-results');

  if (!results || results.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-search"></i>
                <h3>No Results Found</h3>
                <p>Try a different search term</p>
            </div>
        `;
    return;
  }

  container.innerHTML = results.map((item, index) => createSearchResultCard(item, index)).join('');
}

function createSearchResultCard(item, index) {
  const seedClass = getSeedClass(parseInt(item.seeders) || 0);

  return `
        <div class="item-card">
            <div class="item-header">
                <div class="item-info">
                    <div class="item-name">
                        <span style="color: var(--text-muted); margin-right: 0.5rem;">#${index + 1}</span>
                        ${escapeHtml(item.name)}
                    </div>
                    <div class="item-meta">
                        <span><i class="bi bi-hdd"></i> ${item.size}</span>
                        <span class="${seedClass}"><i class="bi bi-arrow-up"></i> ${item.seeders} seeds</span>
                        <span><i class="bi bi-arrow-down"></i> ${item.leechers} leeches</span>
                    </div>
                </div>
            </div>
            
            <div class="item-actions">
                <button class="btn btn-primary btn-sm" onclick="addTorrentFromSearch('${escapeAttr(item.magnet)}')">
                    <i class="bi bi-download"></i> Download
                </button>
                <button class="btn btn-secondary btn-sm" onclick="copyToClipboard(this)" data-url="${escapeAttr(item.magnet)}">
                    <i class="bi bi-clipboard"></i> Copy Magnet
                </button>
            </div>
        </div>
    `;
}

function getSeedClass(seeds) {
  if (seeds >= 2000) return 'text-success';
  if (seeds >= 500) return 'text-warning';
  return '';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  if (!text) return '';
  return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function addTorrentFromSearch(magnet) {
  $.ajax({
    url: '/api/add',
    type: 'POST',
    data: { magnet: magnet },
    success: function () {
      Toast('Torrent added successfully!', 'success');
    },
    error: function (xhr) {
      if (xhr.status === 400) {
        Toast('Torrent already exists', 'warning');
      } else {
        Toast('Error: ' + xhr.responseText, 'error');
      }
    }
  });
}

// Helper styles injected
const style = document.createElement('style');
style.textContent = `
    .text-success { color: var(--neon-green) !important; }
    .text-warning { color: var(--neon-yellow) !important; }
`;
document.head.appendChild(style);
