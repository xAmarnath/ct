package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"
)

var (
	aria2Available bool
	aria2Mutex     sync.RWMutex
	aria2Downloads = make(map[string]*Aria2Download)
)

type Aria2Download struct {
	GID           string  `json:"gid"`
	Name          string  `json:"name"`
	TotalLength   int64   `json:"total_length"`
	CompletedLen  int64   `json:"completed_length"`
	DownloadSpeed int64   `json:"download_speed"`
	Status        string  `json:"status"`
	Progress      string  `json:"progress"`
	ProgressNum   float64 `json:"progress_num"`
	Speed         string  `json:"speed"`
}

type Aria2RPCRequest struct {
	Jsonrpc string        `json:"jsonrpc"`
	ID      string        `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params,omitempty"`
}

type Aria2RPCResponse struct {
	ID      string          `json:"id"`
	Jsonrpc string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *Aria2Error     `json:"error,omitempty"`
}

type Aria2Error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type Aria2StatusResult struct {
	GID             string `json:"gid"`
	Status          string `json:"status"`
	TotalLength     string `json:"totalLength"`
	CompletedLength string `json:"completedLength"`
	DownloadSpeed   string `json:"downloadSpeed"`
	Files           []struct {
		Path string `json:"path"`
	} `json:"files"`
}

const aria2RPCURL = "http://localhost:6800/jsonrpc"

func InitAria2() {

	_, err := exec.LookPath("aria2c")
	if err != nil {
		log.Println("aria2c not found in PATH - aria2 features disabled")
		aria2Available = false
		return
	}

	if !checkAria2RPC() {

		log.Println("Starting aria2c daemon on port 6800...")
		go startAria2Daemon()

		time.Sleep(2 * time.Second)
		if checkAria2RPC() {
			aria2Available = true
			log.Println("aria2c started successfully - aria2 features enabled")
		} else {
			log.Println("Could not start aria2c - aria2 features disabled")
			aria2Available = false
		}
	} else {
		aria2Available = true
		log.Println("aria2c RPC available - aria2 features enabled")
	}
}

func checkAria2RPC() bool {
	conn, err := net.DialTimeout("tcp", "localhost:6800", 2*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func startAria2Daemon() {
	cmd := exec.Command("aria2c",
		"--enable-rpc",
		"--rpc-listen-port=6800",
		"--rpc-listen-all=false",
		"--rpc-allow-origin-all=true",
		"--dir="+Root+"/downloads",
		"--continue=true",
		"--max-concurrent-downloads=5",
		"--max-connection-per-server=16",
		"--split=16",
		"--min-split-size=1M",
	)
	if err := cmd.Start(); err != nil {
		log.Printf("Failed to start aria2c: %v", err)
	}
}

func IsAria2Available() bool {
	aria2Mutex.RLock()
	defer aria2Mutex.RUnlock()
	return aria2Available
}

func aria2Call(method string, params ...interface{}) (*Aria2RPCResponse, error) {
	if !IsAria2Available() {
		return nil, fmt.Errorf("aria2 not available")
	}

	req := Aria2RPCRequest{
		Jsonrpc: "2.0",
		ID:      "cloudtorrent",
		Method:  method,
		Params:  params,
	}

	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, "POST", aria2RPCURL,
		jsonStringReader(string(jsonData)))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var rpcResp Aria2RPCResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return nil, err
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("aria2 error: %s", rpcResp.Error.Message)
	}

	return &rpcResp, nil
}

func jsonStringReader(s string) *strings.Reader {
	return strings.NewReader(s)
}

func AddAria2Download(url string) (string, error) {
	resp, err := aria2Call("aria2.addUri", []string{url})
	if err != nil {
		return "", err
	}

	var gid string
	if err := json.Unmarshal(resp.Result, &gid); err != nil {
		return "", err
	}

	return gid, nil
}

func GetAria2Downloads() []Aria2Download {
	if !IsAria2Available() {
		return []Aria2Download{}
	}

	activeResp, err := aria2Call("aria2.tellActive")
	if err != nil {
		return []Aria2Download{}
	}

	waitingResp, err := aria2Call("aria2.tellWaiting", 0, 100)
	if err != nil {
		waitingResp = nil
	}

	stoppedResp, err := aria2Call("aria2.tellStopped", 0, 20)
	if err != nil {
		stoppedResp = nil
	}

	var downloads []Aria2Download

	var activeItems []Aria2StatusResult
	if err := json.Unmarshal(activeResp.Result, &activeItems); err == nil {
		for _, item := range activeItems {
			downloads = append(downloads, parseAria2Status(item))
		}
	}

	if waitingResp != nil {
		var waitingItems []Aria2StatusResult
		if err := json.Unmarshal(waitingResp.Result, &waitingItems); err == nil {
			for _, item := range waitingItems {
				downloads = append(downloads, parseAria2Status(item))
			}
		}
	}

	if stoppedResp != nil {
		var stoppedItems []Aria2StatusResult
		if err := json.Unmarshal(stoppedResp.Result, &stoppedItems); err == nil {
			for _, item := range stoppedItems {
				downloads = append(downloads, parseAria2Status(item))
			}
		}
	}

	return downloads
}

func parseAria2Status(item Aria2StatusResult) Aria2Download {
	total := StringToInt64(item.TotalLength)
	completed := StringToInt64(item.CompletedLength)
	speed := StringToInt64(item.DownloadSpeed)

	var progress float64
	if total > 0 {
		progress = float64(completed) / float64(total) * 100
	}

	name := item.GID
	if len(item.Files) > 0 && item.Files[0].Path != "" {
		name = item.Files[0].Path

		for i := len(name) - 1; i >= 0; i-- {
			if name[i] == '/' || name[i] == '\\' {
				name = name[i+1:]
				break
			}
		}
	}

	status := item.Status
	switch status {
	case "active":
		status = "Downloading"
	case "waiting":
		status = "Queued"
	case "paused":
		status = "Paused"
	case "complete":
		status = "Completed"
	case "error":
		status = "Error"
	case "removed":
		status = "Removed"
	}

	return Aria2Download{
		GID:           item.GID,
		Name:          name,
		TotalLength:   total,
		CompletedLen:  completed,
		DownloadSpeed: speed,
		Status:        status,
		Progress:      fmt.Sprintf("%.1f%%", progress),
		ProgressNum:   progress,
		Speed:         ByteCountSI(speed) + "/s",
	}
}

func PauseAria2Download(gid string) error {
	_, err := aria2Call("aria2.pause", gid)
	return err
}

func ResumeAria2Download(gid string) error {
	_, err := aria2Call("aria2.unpause", gid)
	return err
}

func RemoveAria2Download(gid string) error {
	_, err := aria2Call("aria2.remove", gid)
	if err != nil {
		_, err = aria2Call("aria2.forceRemove", gid)
	}
	return err
}

func init() {
	InitAria2()
}
