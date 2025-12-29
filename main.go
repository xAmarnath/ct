package main

import (
	"fmt"
	"html/template"
	"log"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

var (
	Wd, _ = os.Getwd()
	Root  = filepath.Join(Wd, "downloads")
	Port  = GetOutboundPort()
)

func main() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// Initialize WebSocket
	InitWebSocket()

	// Static files
	r.Static("/static", "./static")

	// HTML pages
	r.GET("/", func(c *gin.Context) {
		c.File("./static/index.html")
	})

	r.GET("/downloads/*path", func(c *gin.Context) {
		tmpl := template.Must(template.ParseFiles("./static/downloads.html"))
		tmpl.Execute(c.Writer, nil)
	})

	r.GET("/stream/*path", func(c *gin.Context) {
		tmpl := template.Must(template.ParseFiles("./static/player.html"))
		tmpl.Execute(c.Writer, nil)
	})

	r.GET("/search", func(c *gin.Context) {
		tmpl := template.Must(template.ParseFiles("./static/search.html"))
		tmpl.Execute(c.Writer, nil)
	})

	// WebSocket endpoint
	r.GET("/ws", func(c *gin.Context) {
		WSHandler(c.Writer, c.Request)
	})

	// API routes
	api := r.Group("/api")
	{
		// Torrent APIs
		api.POST("/add", AddTorrentHandler)
		api.GET("/torrents", ActiveTorrentsHandler)
		api.GET("/torrent", GetTorrentHandler)
		api.POST("/remove", DeleteTorrentHandler)
		api.POST("/pause", PauseTorrentHandler)
		api.POST("/resume", ResumeTorrentHandler)
		api.POST("/removeall", DropAllHandler)
		api.POST("/stopall", StopAllHandler)
		api.POST("/startall", StartAllHandler)

		// System APIs
		api.GET("/status", SystemStatsHandler)

		// File APIs
		api.GET("/search", SearchTorrentsHandler)
		api.GET("/autocomplete", AutoCompleteHandler)
		api.POST("/upload", UploadFileHandler)
		api.GET("/create/*path", CreateFolderHandler)
		api.GET("/deletefile/*path", DeleteFileHandler)
		api.GET("/zip/*path", ZipFolderHandler)

		// Aria2 APIs
		api.GET("/aria2/status", Aria2StatusHandlerGin)
		api.POST("/aria2/add", AddAria2HandlerGin)
		api.GET("/aria2/downloads", GetAria2HandlerGin)
		api.POST("/aria2/pause", PauseAria2HandlerGin)
		api.POST("/aria2/resume", ResumeAria2HandlerGin)
		api.POST("/aria2/remove", RemoveAria2HandlerGin)

		// FFmpeg APIs
		api.GET("/ffmpeg/status", FFmpegStatusHandlerGin)
		api.POST("/ffmpeg/convert", AddConversionHandlerGin)
		api.GET("/ffmpeg/queue", GetConversionQueueHandlerGin)
		api.POST("/ffmpeg/cancel", CancelConversionHandlerGin)
		api.POST("/ffmpeg/remove", RemoveConversionHandlerGin)
	}

	// Directory listing / file serving
	r.GET("/dir/*path", GetDirContentsHandler)

	fmt.Printf("CloudTorrent starting on %s\n", Port)
	fmt.Println("WebSocket enabled at /ws")

	if err := r.Run(Port); err != nil {
		log.Fatal("Server error: ", err)
	}
}

func init() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}
