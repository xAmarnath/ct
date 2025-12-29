package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ffmpegAvailable   bool
	ffmpegMutex       sync.RWMutex
	conversionQueue   = make(map[string]*ConversionJob)
	conversionCounter int
)

type ConversionJob struct {
	ID          string    `json:"id"`
	InputPath   string    `json:"input_path"`
	OutputPath  string    `json:"output_path"`
	InputName   string    `json:"input_name"`
	OutputName  string    `json:"output_name"`
	Format      string    `json:"format"`
	Status      string    `json:"status"`
	Progress    float64   `json:"progress"`
	Duration    float64   `json:"duration"`
	CurrentTime float64   `json:"current_time"`
	Speed       string    `json:"speed"`
	Error       string    `json:"error,omitempty"`
	StartTime   time.Time `json:"start_time"`
	cmd         *exec.Cmd
	cancel      chan struct{}
}

func InitFFmpeg() {

	_, err := exec.LookPath("ffmpeg")
	if err != nil {
		log.Println("ffmpeg not found in PATH - conversion features disabled")
		ffmpegAvailable = false
		return
	}

	_, err = exec.LookPath("ffprobe")
	if err != nil {
		log.Println("ffprobe not found in PATH - conversion features disabled")
		ffmpegAvailable = false
		return
	}

	ffmpegAvailable = true
	log.Println("ffmpeg/ffprobe found - conversion features enabled")
}

func IsFFmpegAvailable() bool {
	ffmpegMutex.RLock()
	defer ffmpegMutex.RUnlock()
	return ffmpegAvailable
}

func GetVideoDuration(path string) (float64, error) {
	cmd := exec.Command("ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		path,
	)

	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	duration, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	if err != nil {
		return 0, err
	}

	return duration, nil
}

func AddConversionJob(inputPath string, format string) (*ConversionJob, error) {
	if !IsFFmpegAvailable() {
		return nil, fmt.Errorf("ffmpeg not available")
	}

	if _, err := os.Stat(inputPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("input file not found: %s", inputPath)
	}

	duration, err := GetVideoDuration(inputPath)
	if err != nil {
		log.Printf("Warning: could not get video duration: %v", err)
		duration = 0
	}

	inputName := filepath.Base(inputPath)
	nameWithoutExt := strings.TrimSuffix(inputName, filepath.Ext(inputName))
	outputName := fmt.Sprintf("%s_converted.%s", nameWithoutExt, format)
	outputPath := filepath.Join(filepath.Dir(inputPath), outputName)

	ffmpegMutex.Lock()
	conversionCounter++
	jobID := fmt.Sprintf("conv_%d_%d", time.Now().Unix(), conversionCounter)
	ffmpegMutex.Unlock()

	job := &ConversionJob{
		ID:         jobID,
		InputPath:  inputPath,
		OutputPath: outputPath,
		InputName:  inputName,
		OutputName: outputName,
		Format:     format,
		Status:     "queued",
		Progress:   0,
		Duration:   duration,
		StartTime:  time.Now(),
		cancel:     make(chan struct{}),
	}

	ffmpegMutex.Lock()
	conversionQueue[jobID] = job
	ffmpegMutex.Unlock()

	go runConversion(job)

	return job, nil
}

func runConversion(job *ConversionJob) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Conversion panic: %v", r)
			job.Status = "error"
			job.Error = fmt.Sprintf("%v", r)
		}
	}()

	job.Status = "converting"

	var args []string
	args = append(args, "-i", job.InputPath)
	args = append(args, "-y")
	args = append(args, "-progress", "pipe:1")
	args = append(args, "-stats_period", "0.5")

	switch job.Format {
	case "mp4":
		args = append(args, "-c:v", "libx264", "-preset", "medium", "-crf", "23")
		args = append(args, "-c:a", "aac", "-b:a", "128k")
		args = append(args, "-movflags", "+faststart")
	case "webm":
		args = append(args, "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0")
		args = append(args, "-c:a", "libopus", "-b:a", "128k")
	case "mkv":
		args = append(args, "-c:v", "libx264", "-preset", "medium", "-crf", "23")
		args = append(args, "-c:a", "copy")
	default:
		args = append(args, "-c:v", "libx264", "-preset", "medium", "-crf", "23")
		args = append(args, "-c:a", "aac", "-b:a", "128k")
	}

	args = append(args, job.OutputPath)

	job.cmd = exec.Command("ffmpeg", args...)

	stdout, err := job.cmd.StdoutPipe()
	if err != nil {
		job.Status = "error"
		job.Error = err.Error()
		return
	}

	stderr, err := job.cmd.StderrPipe()
	if err != nil {
		job.Status = "error"
		job.Error = err.Error()
		return
	}

	if err := job.cmd.Start(); err != nil {
		job.Status = "error"
		job.Error = err.Error()
		return
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {

		}
	}()

	scanner := bufio.NewScanner(stdout)
	timeRegex := regexp.MustCompile(`out_time_ms=(\d+)`)
	speedRegex := regexp.MustCompile(`speed=(\S+)`)

	for scanner.Scan() {
		select {
		case <-job.cancel:
			job.cmd.Process.Kill()
			job.Status = "cancelled"
			return
		default:
		}

		line := scanner.Text()

		if matches := timeRegex.FindStringSubmatch(line); len(matches) > 1 {
			timeMs, _ := strconv.ParseInt(matches[1], 10, 64)
			job.CurrentTime = float64(timeMs) / 1000000.0

			if job.Duration > 0 {
				job.Progress = (job.CurrentTime / job.Duration) * 100
				if job.Progress > 100 {
					job.Progress = 100
				}
			}
		}

		if matches := speedRegex.FindStringSubmatch(line); len(matches) > 1 {
			job.Speed = matches[1]
		}
	}

	if err := job.cmd.Wait(); err != nil {
		if job.Status != "cancelled" {
			job.Status = "error"
			job.Error = err.Error()
		}
		return
	}

	job.Status = "completed"
	job.Progress = 100
}

func CancelConversion(jobID string) error {
	ffmpegMutex.Lock()
	defer ffmpegMutex.Unlock()

	job, exists := conversionQueue[jobID]
	if !exists {
		return fmt.Errorf("job not found")
	}

	if job.Status == "converting" {
		close(job.cancel)
	}

	job.Status = "cancelled"
	return nil
}

func GetConversionQueue() []*ConversionJob {
	ffmpegMutex.RLock()
	defer ffmpegMutex.RUnlock()

	var jobs []*ConversionJob
	for _, job := range conversionQueue {
		jobs = append(jobs, job)
	}
	return jobs
}

func RemoveConversionJob(jobID string) error {
	ffmpegMutex.Lock()
	defer ffmpegMutex.Unlock()

	job, exists := conversionQueue[jobID]
	if !exists {
		return fmt.Errorf("job not found")
	}

	if job.Status == "converting" {
		close(job.cancel)
	}

	delete(conversionQueue, jobID)
	return nil
}

func init() {
	InitFFmpeg()
}
