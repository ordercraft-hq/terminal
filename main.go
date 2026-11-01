package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/ordercraft-hq/terminal/internal/server"
	"github.com/ordercraft-hq/terminal/internal/storage"
)

//go:embed all:frontend/dist
var embeddedFrontend embed.FS

const defaultWorkstationPort = 8448

func resolveDefaultPort() int {
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil && p > 0 {
			return p
		}
	}
	return defaultWorkstationPort
}

// bindWithFallback attempts to bind to startPort; if already in use, it probes
// subsequent ports up to maxAttempts to guarantee startup without port collisions.
func bindWithFallback(host string, startPort int, maxAttempts int) (net.Listener, int, error) {
	for attempt := 0; attempt < maxAttempts; attempt++ {
		targetPort := startPort + attempt
		addr := fmt.Sprintf("%s:%d", host, targetPort)
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			if attempt > 0 {
				log.Printf("[Server] Port %d was in use; automatically bound to next available port %d\n", startPort, targetPort)
			}
			return ln, targetPort, nil
		}
	}
	return nil, 0, fmt.Errorf("failed to bind to ports %d-%d after %d attempts", startPort, startPort+maxAttempts-1, maxAttempts)
}

func main() {
	defaultPort := resolveDefaultPort()
	port := flag.Int("port", defaultPort, "Port for the HTTP and WebSocket server (supports PORT env var)")
	host := flag.String("host", "127.0.0.1", "Host address to bind the server")
	dbPath := flag.String("db", "data/ordercraft.db", "SQLite database path")
	noBrowser := flag.Bool("no-browser", false, "Disable automatic browser launching on startup")
	appMode := flag.Bool("app-mode", false, "Launch browser in standalone application window mode (--app)")
	flag.Parse()

	log.Println("==================================================")
	log.Println("  ORDERCRAFT — Financial Workstation v0.1.0        ")
	log.Println("==================================================")

	s, err := storage.NewStorage(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize SQLite storage: %v", err)
	}
	defer s.Close()
	log.Printf("[Storage] SQLite initialized at %s\n", *dbPath)

	srv := server.NewServer(s)

	// Mount embedded frontend production bundle with SPA routing
	if distFS, err := fs.Sub(embeddedFrontend, "frontend/dist"); err == nil {
		srv.SetStaticFS(distFS)
		log.Println("[Frontend] Embedded React production bundle mounted at /")
	} else {
		log.Printf("[Frontend] Warning: failed to mount embedded frontend: %v\n", err)
	}

	listener, actualPort, err := bindWithFallback(*host, *port, 20)
	if err != nil {
		log.Fatalf("Failed to bind network listener: %v", err)
	}
	defer listener.Close()

	targetURL := fmt.Sprintf("http://%s:%d", *host, actualPort)

	go func() {
		log.Printf("[Server] OrderCraft listening on %s\n", targetURL)
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	if !*noBrowser {
		go openBrowser(targetURL, *appMode)
	}

	// Wait for terminate signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("[Shutdown] Gracefully shutting down ORDERCRAFT backend...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Shutdown error: %v\n", err)
	}
	log.Println("[Shutdown] Complete.")
}

func openBrowser(targetURL string, appMode bool) {
	time.Sleep(200 * time.Millisecond)

	if appMode {
		if launched := launchAppMode(targetURL); launched {
			return
		}
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", targetURL)
	case "darwin":
		cmd = exec.Command("open", targetURL)
	default:
		cmd = exec.Command("xdg-open", targetURL)
	}
	_ = cmd.Start()
}

func launchAppMode(targetURL string) bool {
	if runtime.GOOS == "windows" {
		candidates := []string{
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("PROGRAMFILES"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("PROGRAMFILES(X86)"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("PROGRAMFILES(X86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("PROGRAMFILES"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("LOCALAPPDATA"), "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
		}
		for _, path := range candidates {
			if _, err := os.Stat(path); err == nil {
				cmd := exec.Command(path, fmt.Sprintf("--app=%s", targetURL))
				if err := cmd.Start(); err == nil {
					return true
				}
			}
		}
	} else if runtime.GOOS == "darwin" {
		candidates := []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		}
		for _, path := range candidates {
			if _, err := os.Stat(path); err == nil {
				cmd := exec.Command(path, fmt.Sprintf("--app=%s", targetURL))
				if err := cmd.Start(); err == nil {
					return true
				}
			}
		}
	} else {
		// Linux
		candidates := []string{"google-chrome", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"}
		for _, bin := range candidates {
			if path, err := exec.LookPath(bin); err == nil {
				cmd := exec.Command(path, fmt.Sprintf("--app=%s", targetURL))
				if err := cmd.Start(); err == nil {
					return true
				}
			}
		}
	}
	return false
}
