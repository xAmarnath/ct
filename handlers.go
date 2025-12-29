package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/gin-gonic/gin"
)

// Gin Handlers

func AddTorrentHandler(c *gin.Context) {
	magnet := c.PostForm("magnet")
	if magnet == "" {
		c.String(http.StatusBadRequest, "No magnet provided")
		return
	}
	if ok, err := AddTorrentByMagnet(magnet); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	} else if !ok {
		c.String(http.StatusBadRequest, "Torrent already exists")
		return
	}
	BroadcastMessage("torrent_added", map[string]string{"status": "ok"})
	c.Status(http.StatusOK)
}

func ActiveTorrentsHandler(c *gin.Context) {
	torrents := GetAllTorrents()
	c.JSON(http.StatusOK, torrents)
}

func GetTorrentHandler(c *gin.Context) {
	id := c.Query("uid")
	if id == "" {
		c.String(http.StatusBadRequest, "No uid provided")
		return
	}
	torrent := GetTorrentByID(id)
	if torrent.Status == "" {
		c.String(http.StatusNotFound, "Torrent not found")
		return
	}
	c.JSON(http.StatusOK, torrent)
}

func DeleteTorrentHandler(c *gin.Context) {
	id := c.PostForm("uid")
	if id == "" {
		c.String(http.StatusBadRequest, "No uid provided")
		return
	}
	if ok, err := DeleteTorrentByID(id); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	} else if !ok {
		c.String(http.StatusNotFound, "Torrent not found")
		return
	}
	BroadcastMessage("torrent_removed", map[string]string{"uid": id})
	c.Status(http.StatusOK)
}

func PauseTorrentHandler(c *gin.Context) {
	id := c.PostForm("uid")
	if id == "" {
		c.String(http.StatusBadRequest, "No uid provided")
		return
	}
	if ok, err := PauseTorrentByID(id); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	} else if !ok {
		c.String(http.StatusNotFound, "Torrent not found")
		return
	}
	c.Status(http.StatusOK)
}

func ResumeTorrentHandler(c *gin.Context) {
	id := c.PostForm("uid")
	if id == "" {
		c.String(http.StatusBadRequest, "No uid provided")
		return
	}
	if ok, err := ResumeTorrentByID(id); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	} else if !ok {
		c.String(http.StatusNotFound, "Torrent not found")
		return
	}
	c.Status(http.StatusOK)
}

func DropAllHandler(c *gin.Context) {
	if err := DropAllTorrents(); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusOK)
}

func StartAllHandler(c *gin.Context) {
	StartAll()
	c.Status(http.StatusOK)
}

func StopAllHandler(c *gin.Context) {
	StopAll()
	c.Status(http.StatusOK)
}

func SystemStatsHandler(c *gin.Context) {
	Disk := DiskUsage(Root)
	Details := SysInfo{
		IP:        c.ClientIP(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		CPU:       fmt.Sprint(runtime.NumCPU()),
		Mem:       MemUsage(),
		Disk:      fmt.Sprintf("%s/%s", Disk.Used, Disk.All),
		Downloads: fmt.Sprint(GetLenTorrents()),
	}
	c.JSON(http.StatusOK, Details)
}

func DeleteFileHandler(c *gin.Context) {
	path := strings.Replace(AbsPath(filepath.Join(Root, c.Param("path"))), "api/deletefile/", "", 1)
	if strings.Contains(path, "/downloads/downloads") {
		path = strings.Replace(path, "/downloads", "", 1)
	}
	if strings.Contains(path, "torrents.db") || c.Param("path") == "/downloads/torrents" {
		c.String(http.StatusBadRequest, "Protected path, cant delete!")
		return
	}
	if err := DeleteFile(path); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusOK)
}

func UploadFileHandler(c *gin.Context) {
	file, handler, err := c.Request.FormFile("file")
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	defer file.Close()

	log.Printf("Uploaded file: %+v\n", handler.Filename)
	log.Printf("File size: %+v\n", handler.Size)

	DirPath := AbsPath(strings.Replace(AbsPath(filepath.Join(Root, c.PostForm("path"))), "/downloads", "", 1))
	f, err := os.OpenFile(filepath.Join(DirPath, handler.Filename), os.O_WRONLY|os.O_CREATE, 0666)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	defer f.Close()
	io.Copy(f, file)
	c.Status(http.StatusOK)
}

func CreateFolderHandler(c *gin.Context) {
	DirPath := AbsPath(strings.Replace(AbsPath(filepath.Join(Root, c.Param("path"))), "/api/create/downloads", "", 1))
	if err := os.MkdirAll(DirPath, 0777); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusOK)
}

func GetDirContentsHandler(c *gin.Context) {
	path := strings.Replace(AbsPath(filepath.Join(Root, c.Param("path"))), "/dir", "", 1)
	if IsDir, err := isDirectory(path); err == nil && IsDir {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			c.String(http.StatusNotFound, "Directory not found")
			return
		}
		files, err := GetDirContentsMap(path)
		if err != nil {
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		if len(files) == 0 {
			c.JSON(http.StatusOK, []FileInfo{})
			return
		}
		c.JSON(http.StatusOK, files)
	} else {
		c.File(path)
	}
}

func AutoCompleteHandler(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		c.String(http.StatusBadRequest, "No query")
		return
	}
	var client = http.DefaultClient
	resp, err := client.Get("https://streamm4u.ws/searchJS?term=" + url.QueryEscape(q))
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	defer resp.Body.Close()
	var data []string
	json.NewDecoder(resp.Body).Decode(&data)
	c.JSON(http.StatusOK, data)
}

func SearchTorrentsHandler(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		c.String(http.StatusBadRequest, "No query")
		return
	}
	c.Data(http.StatusOK, "application/json", GatherSearchResults(q))
}

func ZipFolderHandler(c *gin.Context) {
	path := strings.Replace(AbsPath(filepath.Join(Root, c.Param("path"))), "api/zip/", "", 1)
	if strings.Contains(path, "/downloads/downloads") {
		path = strings.Replace(path, "/downloads", "", 1)
	}
	folderName := filepath.Base(path)
	_, err := ZipDir(path, folderName)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	filePath := "/dir/torrents/" + folderName + ".zip"
	c.JSON(http.StatusOK, gin.H{
		"file": filePath,
		"name": folderName + ".zip",
	})
}

// Aria2 Gin Handlers

func Aria2StatusHandlerGin(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"available": IsAria2Available()})
}

func AddAria2HandlerGin(c *gin.Context) {
	if !IsAria2Available() {
		c.String(http.StatusServiceUnavailable, "aria2 not available")
		return
	}
	url := c.PostForm("url")
	if url == "" {
		c.String(http.StatusBadRequest, "No URL provided")
		return
	}
	gid, err := AddAria2Download(url)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"gid": gid})
}

func GetAria2HandlerGin(c *gin.Context) {
	if !IsAria2Available() {
		c.JSON(http.StatusOK, []Aria2Download{})
		return
	}
	c.JSON(http.StatusOK, GetAria2Downloads())
}

func PauseAria2HandlerGin(c *gin.Context) {
	if !IsAria2Available() {
		c.String(http.StatusServiceUnavailable, "aria2 not available")
		return
	}
	gid := c.PostForm("gid")
	if gid == "" {
		c.String(http.StatusBadRequest, "No GID provided")
		return
	}
	if err := PauseAria2Download(gid); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusOK)
}

func ResumeAria2HandlerGin(c *gin.Context) {
	if !IsAria2Available() {
		c.String(http.StatusServiceUnavailable, "aria2 not available")
		return
	}
	gid := c.PostForm("gid")
	if gid == "" {
		c.String(http.StatusBadRequest, "No GID provided")
		return
	}
	if err := ResumeAria2Download(gid); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusOK)
}

func RemoveAria2HandlerGin(c *gin.Context) {
	if !IsAria2Available() {
		c.String(http.StatusServiceUnavailable, "aria2 not available")
		return
	}
	gid := c.PostForm("gid")
	if gid == "" {
		c.String(http.StatusBadRequest, "No GID provided")
		return
	}
	if err := RemoveAria2Download(gid); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusOK)
}

// FFmpeg Gin Handlers

func FFmpegStatusHandlerGin(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"available": IsFFmpegAvailable()})
}

func AddConversionHandlerGin(c *gin.Context) {
	if !IsFFmpegAvailable() {
		c.String(http.StatusServiceUnavailable, "ffmpeg not available")
		return
	}
	inputPath := c.PostForm("path")
	format := c.PostForm("format")
	if inputPath == "" {
		c.String(http.StatusBadRequest, "No input path provided")
		return
	}
	if format == "" {
		format = "mp4"
	}
	if !filepath.IsAbs(inputPath) {
		inputPath = strings.TrimPrefix(inputPath, "/dir")
		inputPath = filepath.Join(Root, inputPath)
	}
	job, err := AddConversionJob(inputPath, format)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, job)
}

func GetConversionQueueHandlerGin(c *gin.Context) {
	if !IsFFmpegAvailable() {
		c.JSON(http.StatusOK, []*ConversionJob{})
		return
	}
	c.JSON(http.StatusOK, GetConversionQueue())
}

func CancelConversionHandlerGin(c *gin.Context) {
	if !IsFFmpegAvailable() {
		c.String(http.StatusServiceUnavailable, "ffmpeg not available")
		return
	}
	jobID := c.PostForm("id")
	if jobID == "" {
		c.String(http.StatusBadRequest, "No job ID provided")
		return
	}
	if err := CancelConversion(jobID); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusOK)
}

func RemoveConversionHandlerGin(c *gin.Context) {
	if !IsFFmpegAvailable() {
		c.String(http.StatusServiceUnavailable, "ffmpeg not available")
		return
	}
	jobID := c.PostForm("id")
	if jobID == "" {
		c.String(http.StatusBadRequest, "No job ID provided")
		return
	}
	if err := RemoveConversionJob(jobID); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusOK)
}
