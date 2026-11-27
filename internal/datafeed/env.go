package datafeed

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	dotEnvMu     sync.Mutex
	dotEnvParsed = make(map[string]map[string]string)
)

// LoadDotEnv parses key-value pairs from the first existing .env file in paths
// (or all provided existing paths if already parsed) and injects any unset keys
// into the process environment. Parsed files are cached per resolved path so
// repeated calls across main and providers do not re-open or re-parse .env files.
func LoadDotEnv(paths ...string) {
	if len(paths) == 0 {
		paths = []string{".env", "../.env", "../../.env", "../../../.env"}
	}

	dotEnvMu.Lock()
	defer dotEnvMu.Unlock()

	for _, p := range paths {
		absPath, err := filepath.Abs(p)
		if err != nil {
			absPath = p
		}

		if cachedVars, ok := dotEnvParsed[absPath]; ok {
			applyEnvVars(cachedVars)
			return
		}

		vars, ok := parseDotEnvFile(absPath)
		if !ok {
			continue
		}
		dotEnvParsed[absPath] = vars
		applyEnvVars(vars)
		return
	}
}

func parseDotEnvFile(path string) (map[string]string, bool) {
	f, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	defer f.Close()

	vars := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.TrimSpace(parts[0])
		v := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
		if k != "" {
			vars[k] = v
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, false
	}
	return vars, true
}

func applyEnvVars(vars map[string]string) {
	for k, v := range vars {
		if _, exists := os.LookupEnv(k); !exists {
			_ = os.Setenv(k, v)
		}
	}
}
