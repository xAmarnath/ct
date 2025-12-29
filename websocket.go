package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	wsClients   = make(map[*websocket.Conn]bool)
	wsClientsMu sync.RWMutex
	wsBroadcast = make(chan WSMessage, 100)
)

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func InitWebSocket() {
	go handleWSBroadcast()
	go streamUpdates()
}

func handleWSBroadcast() {
	for msg := range wsBroadcast {
		data, err := json.Marshal(msg)
		if err != nil {
			continue
		}

		wsClientsMu.RLock()
		for client := range wsClients {
			err := client.WriteMessage(websocket.TextMessage, data)
			if err != nil {
				client.Close()
				wsClientsMu.RUnlock()
				wsClientsMu.Lock()
				delete(wsClients, client)
				wsClientsMu.Unlock()
				wsClientsMu.RLock()
			}
		}
		wsClientsMu.RUnlock()
	}
}

func streamUpdates() {
	ticker := time.NewTicker(600 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		// Send torrent updates
		torrents := GetAllTorrents()
		wsBroadcast <- WSMessage{Type: "torrents", Data: torrents}

		// Send aria2 updates if available
		if IsAria2Available() {
			downloads := GetAria2Downloads()
			wsBroadcast <- WSMessage{Type: "aria2", Data: downloads}
		}

		// Send ffmpeg updates if available
		if IsFFmpegAvailable() {
			jobs := GetConversionQueue()
			wsBroadcast <- WSMessage{Type: "ffmpeg", Data: jobs}
		}
	}
}

func WSHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	wsClientsMu.Lock()
	wsClients[conn] = true
	wsClientsMu.Unlock()

	log.Printf("WebSocket client connected, total: %d", len(wsClients))

	// Send initial data
	go func() {
		time.Sleep(100 * time.Millisecond)
		wsBroadcast <- WSMessage{Type: "torrents", Data: GetAllTorrents()}
		wsBroadcast <- WSMessage{Type: "aria2_status", Data: map[string]bool{"available": IsAria2Available()}}
		wsBroadcast <- WSMessage{Type: "ffmpeg_status", Data: map[string]bool{"available": IsFFmpegAvailable()}}
	}()

	// Read messages (for future commands via WS)
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		handleWSCommand(conn, msg)
	}

	wsClientsMu.Lock()
	delete(wsClients, conn)
	wsClientsMu.Unlock()
	conn.Close()
	log.Printf("WebSocket client disconnected, remaining: %d", len(wsClients))
}

func handleWSCommand(conn *websocket.Conn, msg []byte) {
	var cmd struct {
		Action string `json:"action"`
		Data   string `json:"data"`
	}
	if err := json.Unmarshal(msg, &cmd); err != nil {
		return
	}

	var response interface{}
	var err error

	switch cmd.Action {
	case "add_torrent":
		_, err = AddTorrentByMagnet(cmd.Data)
		if err == nil {
			response = map[string]string{"status": "ok", "message": "Torrent added"}
		}
	case "remove_torrent":
		_, err = DeleteTorrentByID(cmd.Data)
	case "pause_torrent":
		_, err = PauseTorrentByID(cmd.Data)
	case "resume_torrent":
		_, err = ResumeTorrentByID(cmd.Data)
	case "add_download":
		if IsAria2Available() {
			_, err = AddAria2Download(cmd.Data)
		}
	}

	if err != nil {
		response = map[string]string{"status": "error", "message": err.Error()}
	} else if response == nil {
		response = map[string]string{"status": "ok"}
	}

	data, _ := json.Marshal(WSMessage{Type: "response", Data: response})
	conn.WriteMessage(websocket.TextMessage, data)
}

func BroadcastMessage(msgType string, data interface{}) {
	wsBroadcast <- WSMessage{Type: msgType, Data: data}
}
