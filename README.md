# CloudTorrent

A modern, self-hosted torrent client with web UI. Features include:

- **Torrent Downloads** - Using Rain torrent library
- **Direct Downloads** - Via Aria2 integration (optional)
- **Video Conversion** - Via FFmpeg integration (optional)
- **Real-time Updates** - WebSocket-based live progress
- **Modern UI** - Dark editorial theme, mobile responsive

## Features

- 🧲 Magnet link and torrent file support
- ⚡ Real-time download progress via WebSocket
- 📁 Built-in file browser with download/stream
- 🎬 Video player with streaming support
- 🔄 Aria2 integration for HTTP/FTP downloads
- 🎥 FFmpeg video conversion (MP4, WebM, MKV)
- 🔍 Torrent search
- 📱 Mobile responsive UI

## Quick Start

### Using Docker

```bash
docker build -t cloudtorrent .
docker run -d -p 8080:8080 -v ./downloads:/app/downloads cloudtorrent
```

### Manual Build

```bash
# Prerequisites: Go 1.21+
go build -o cloudtorrent .
./cloudtorrent
```

Access the UI at `http://localhost:8080`

## Optional Dependencies

- **Aria2** - For HTTP/FTP direct downloads
  - Install: `apt install aria2` or `brew install aria2`
  - CloudTorrent will auto-detect and enable if available

- **FFmpeg** - For video format conversion
  - Install: `apt install ffmpeg` or `brew install ffmpeg`
  - CloudTorrent will auto-detect and enable if available

## Configuration

By default, CloudTorrent uses:
- Port: `8080` (or auto-detected available port)
- Downloads directory: `./downloads/`
- Torrent data: `./downloads/torrents/`
- Database: `./downloads/torrents.db`

## API Endpoints

### Torrents
- `POST /api/add` - Add torrent by magnet
- `GET /api/torrents` - List active torrents
- `POST /api/remove` - Remove torrent
- `POST /api/pause` - Pause torrent
- `POST /api/resume` - Resume torrent

### Aria2 (if available)
- `GET /api/aria2/status` - Check availability
- `POST /api/aria2/add` - Add download URL
- `GET /api/aria2/downloads` - List downloads

### FFmpeg (if available)
- `GET /api/ffmpeg/status` - Check availability
- `POST /api/ffmpeg/convert` - Start conversion
- `GET /api/ffmpeg/queue` - List conversions

### WebSocket
- `GET /ws` - Real-time updates

## License

MIT
