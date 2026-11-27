package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/ordercraft-hq/terminal/internal/security"
	_ "modernc.org/sqlite"
)

type Layout struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Symbol     string `json:"symbol"`
	Resolution string `json:"resolution"`
	Content    string `json:"content,omitempty"`
	Timestamp  int64  `json:"timestamp"`
	IsFavorite bool   `json:"is_favorite"`
}

type Drawing struct {
	ID        string `json:"id"`
	LayoutID  string `json:"layout_id"`
	ToolType  string `json:"tool_type"`
	Symbol    string `json:"symbol"`
	Data      string `json:"data"`
	Timestamp int64  `json:"timestamp"`
}

type DrawingTemplate struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ToolType  string `json:"tool_type"`
	Settings  string `json:"settings"`
	CreatedAt int64  `json:"created_at"`
}

type ChartTemplate struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Settings  string `json:"settings"`
	CreatedAt int64  `json:"created_at"`
}

type UserIndicator struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Code        string   `json:"code"`
	Permissions []string `json:"permissions"`
	CreatedAt   int64    `json:"createdAt"`
	UpdatedAt   int64    `json:"updatedAt"`
}

type ImbalanceRule struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Settings  string `json:"settings"`
	CreatedAt int64  `json:"created_at"`
}

type Storage struct {
	db      *sql.DB
	writeMu sync.Mutex
	cipher  *security.Cipher
}

// NewStorage opens an embedded SQLite database using pure-Go modernc.org/sqlite.
func NewStorage(dbPath string) (*Storage, error) {
	isMemory := dbPath == ":memory:" || strings.Contains(dbPath, "mode=memory")
	if !isMemory {
		if dir := filepath.Dir(dbPath); dir != "." && dir != "" {
			if err := os.MkdirAll(dir, 0700); err != nil {
				return nil, fmt.Errorf("failed to create db directory: %w", err)
			}
			_ = security.EnforcePrivateDirPermissions(dir)
		}
	}

	// Resolve master encryption key and initialize credential cipher
	keyPath := ""
	if !isMemory {
		keyPath = filepath.Join(filepath.Dir(dbPath), ".ordercraft.key")
	}
	masterKey, err := security.ResolveMasterKey(keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve encryption key: %w", err)
	}
	c, err := security.NewCipher(masterKey)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize credential cipher: %w", err)
	}

	// Pre-create and restrict dbPath permissions before SQLite WAL initialization and schema migration.
	if !isMemory {
		if f, openErr := os.OpenFile(dbPath, os.O_CREATE|os.O_RDWR, 0600); openErr == nil {
			_ = f.Close()
		}
		_ = security.EnforcePrivateFilePermissions(dbPath)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// Single persistent connection in WAL mode: guarantees connection-scoped PRAGMAs
	// (busy_timeout, foreign_keys, synchronous, cache_size) remain active and eliminates
	// SQLITE_BUSY write contention under modernc.org/sqlite.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	// Recommended SQLite PRAGMAs for high-performance WAL mode & memory-mapped caching
	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA busy_timeout = 5000;",
		"PRAGMA cache_size = -64000;", // 64MB memory page cache
		"PRAGMA mmap_size = 268435456;", // 256MB memory-mapped I/O
		"PRAGMA temp_store = MEMORY;",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			return nil, fmt.Errorf("failed to set pragma %q: %w", p, err)
		}
	}

	s := &Storage{db: db, cipher: c}
	if err := s.initSchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	// Migrate any existing unencrypted legacy API keys to AES-256-GCM
	_ = s.migrateLegacyKeys(context.Background())

	// Enforce owner-only file permissions on database and WAL/SHM sidecar files
	if !isMemory {
		for _, targetPath := range []string{dbPath, dbPath + "-wal", dbPath + "-shm"} {
			if info, statErr := os.Stat(targetPath); statErr == nil && !info.IsDir() {
				_ = security.EnforcePrivateFilePermissions(targetPath)
			}
		}
	}

	return s, nil
}

func (s *Storage) Close() error {
	return s.db.Close()
}

func (s *Storage) execWrite(ctx context.Context, query string, args ...any) (sql.Result, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.db.ExecContext(ctx, query, args...)
}

func (s *Storage) initSchema() error {
	query := `
	CREATE TABLE IF NOT EXISTS layouts (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		symbol TEXT NOT NULL,
		resolution TEXT NOT NULL,
		content TEXT NOT NULL,
		timestamp INTEGER NOT NULL,
		is_favorite INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS drawings (
		id TEXT PRIMARY KEY,
		layout_id TEXT NOT NULL,
		tool_type TEXT NOT NULL,
		symbol TEXT NOT NULL,
		data TEXT NOT NULL,
		timestamp INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_drawings_layout_symbol ON drawings (layout_id, symbol);

	CREATE TABLE IF NOT EXISTS watchlists (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		symbols TEXT NOT NULL,
		timestamp INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS api_keys (
		provider TEXT PRIMARY KEY,
		key_data TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS drawing_templates (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		tool_type TEXT NOT NULL,
		settings TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_drawing_templates_tool_type ON drawing_templates (tool_type);

	CREATE TABLE IF NOT EXISTS chart_templates (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		settings TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS user_indicators (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		code TEXT NOT NULL,
		permissions TEXT NOT NULL DEFAULT '[]',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_user_indicators_updated ON user_indicators (updated_at DESC);

	CREATE TABLE IF NOT EXISTS orderflow_imbalances (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		settings TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_orderflow_imbalances_created ON orderflow_imbalances (created_at ASC);
	`
	_, err := s.db.Exec(query)
	if err != nil {
		return err
	}
	// Safe migration: add is_favorite column if missing in existing database
	_, _ = s.db.Exec("ALTER TABLE layouts ADD COLUMN is_favorite INTEGER DEFAULT 0;")
	return nil
}

// Layout operations

func (s *Storage) GetLayouts(ctx context.Context) ([]Layout, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, name, symbol, resolution, timestamp, COALESCE(is_favorite, 0) FROM layouts ORDER BY is_favorite DESC, timestamp DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Layout
	for rows.Next() {
		var l Layout
		var favInt int
		if err := rows.Scan(&l.ID, &l.Name, &l.Symbol, &l.Resolution, &l.Timestamp, &favInt); err != nil {
			return nil, err
		}
		l.IsFavorite = favInt == 1
		result = append(result, l)
	}
	return result, rows.Err()
}

func (s *Storage) GetLayout(ctx context.Context, id string) (*Layout, error) {
	var l Layout
	var favInt int
	err := s.db.QueryRowContext(ctx, "SELECT id, name, symbol, resolution, content, timestamp, COALESCE(is_favorite, 0) FROM layouts WHERE id = ?", id).
		Scan(&l.ID, &l.Name, &l.Symbol, &l.Resolution, &l.Content, &l.Timestamp, &favInt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	l.IsFavorite = favInt == 1
	return &l, nil
}

func (s *Storage) SaveLayout(ctx context.Context, l *Layout) error {
	if l.Timestamp == 0 {
		l.Timestamp = time.Now().Unix()
	}
	favInt := 0
	if l.IsFavorite {
		favInt = 1
	}
	query := `
	INSERT INTO layouts (id, name, symbol, resolution, content, timestamp, is_favorite)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		symbol = excluded.symbol,
		resolution = excluded.resolution,
		content = excluded.content,
		timestamp = excluded.timestamp,
		is_favorite = excluded.is_favorite;
	`
	_, err := s.execWrite(ctx, query, l.ID, l.Name, l.Symbol, l.Resolution, l.Content, l.Timestamp, favInt)
	return err
}

func (s *Storage) UpdateLayoutMeta(ctx context.Context, id string, name *string, isFavorite *bool) error {
	if name != nil && isFavorite != nil {
		favInt := 0
		if *isFavorite {
			favInt = 1
		}
		_, err := s.execWrite(ctx, "UPDATE layouts SET name = ?, is_favorite = ?, timestamp = ? WHERE id = ?", *name, favInt, time.Now().Unix(), id)
		return err
	} else if name != nil {
		_, err := s.execWrite(ctx, "UPDATE layouts SET name = ?, timestamp = ? WHERE id = ?", *name, time.Now().Unix(), id)
		return err
	} else if isFavorite != nil {
		favInt := 0
		if *isFavorite {
			favInt = 1
		}
		_, err := s.execWrite(ctx, "UPDATE layouts SET is_favorite = ? WHERE id = ?", favInt, id)
		return err
	}
	return nil
}

func (s *Storage) DeleteLayout(ctx context.Context, id string) error {
	_, err := s.execWrite(ctx, "DELETE FROM layouts WHERE id = ?", id)
	return err
}

// Drawing operations

func (s *Storage) GetDrawings(ctx context.Context, layoutID, symbol string) ([]Drawing, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, layout_id, tool_type, symbol, data, timestamp FROM drawings WHERE layout_id = ? AND symbol = ? ORDER BY timestamp ASC", layoutID, symbol)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Drawing
	for rows.Next() {
		var d Drawing
		if err := rows.Scan(&d.ID, &d.LayoutID, &d.ToolType, &d.Symbol, &d.Data, &d.Timestamp); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, rows.Err()
}

func (s *Storage) SaveDrawing(ctx context.Context, d *Drawing) error {
	if d.Timestamp == 0 {
		d.Timestamp = time.Now().Unix()
	}
	query := `
	INSERT INTO drawings (id, layout_id, tool_type, symbol, data, timestamp)
	VALUES (?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		tool_type = excluded.tool_type,
		data = excluded.data,
		timestamp = excluded.timestamp;
	`
	_, err := s.execWrite(ctx, query, d.ID, d.LayoutID, d.ToolType, d.Symbol, d.Data, d.Timestamp)
	return err
}

func (s *Storage) DeleteDrawing(ctx context.Context, id string) error {
	_, err := s.execWrite(ctx, "DELETE FROM drawings WHERE id = ?", id)
	return err
}

func (s *Storage) ClearDrawings(ctx context.Context, layoutID, symbol string) error {
	if layoutID == "" && symbol == "" {
		_, err := s.execWrite(ctx, "DELETE FROM drawings")
		return err
	}
	if layoutID != "" && symbol != "" {
		_, err := s.execWrite(ctx, "DELETE FROM drawings WHERE layout_id = ? AND symbol = ?", layoutID, symbol)
		return err
	}
	if layoutID != "" {
		_, err := s.execWrite(ctx, "DELETE FROM drawings WHERE layout_id = ?", layoutID)
		return err
	}
	_, err := s.execWrite(ctx, "DELETE FROM drawings WHERE symbol = ?", symbol)
	return err
}

// Drawing Template operations

func (s *Storage) GetDrawingTemplates(ctx context.Context, toolType string) ([]DrawingTemplate, error) {
	var rows *sql.Rows
	var err error
	if toolType != "" {
		rows, err = s.db.QueryContext(ctx, "SELECT id, name, tool_type, settings, created_at FROM drawing_templates WHERE tool_type = ? ORDER BY created_at ASC", toolType)
	} else {
		rows, err = s.db.QueryContext(ctx, "SELECT id, name, tool_type, settings, created_at FROM drawing_templates ORDER BY created_at ASC")
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []DrawingTemplate
	for rows.Next() {
		var t DrawingTemplate
		if err := rows.Scan(&t.ID, &t.Name, &t.ToolType, &t.Settings, &t.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func (s *Storage) SaveDrawingTemplate(ctx context.Context, t *DrawingTemplate) error {
	if t.CreatedAt == 0 {
		t.CreatedAt = time.Now().Unix()
	}
	query := `
	INSERT INTO drawing_templates (id, name, tool_type, settings, created_at)
	VALUES (?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		tool_type = excluded.tool_type,
		settings = excluded.settings,
		created_at = excluded.created_at;
	`
	_, err := s.execWrite(ctx, query, t.ID, t.Name, t.ToolType, t.Settings, t.CreatedAt)
	return err
}

func (s *Storage) DeleteDrawingTemplate(ctx context.Context, id string) error {
	_, err := s.execWrite(ctx, "DELETE FROM drawing_templates WHERE id = ?", id)
	return err
}

// Chart Template operations

func (s *Storage) GetChartTemplates(ctx context.Context) ([]ChartTemplate, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, name, settings, created_at FROM chart_templates ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ChartTemplate
	for rows.Next() {
		var t ChartTemplate
		if err := rows.Scan(&t.ID, &t.Name, &t.Settings, &t.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func (s *Storage) SaveChartTemplate(ctx context.Context, t *ChartTemplate) error {
	if t.CreatedAt == 0 {
		t.CreatedAt = time.Now().Unix()
	}
	query := `
	INSERT INTO chart_templates (id, name, settings, created_at)
	VALUES (?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		settings = excluded.settings,
		created_at = excluded.created_at;
	`
	_, err := s.execWrite(ctx, query, t.ID, t.Name, t.Settings, t.CreatedAt)
	return err
}

func (s *Storage) DeleteChartTemplate(ctx context.Context, id string) error {
	_, err := s.execWrite(ctx, "DELETE FROM chart_templates WHERE id = ?", id)
	return err
}

// Imbalance Rule operations

func (s *Storage) GetImbalanceRules(ctx context.Context) ([]ImbalanceRule, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, name, settings, created_at FROM orderflow_imbalances ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ImbalanceRule
	for rows.Next() {
		var r ImbalanceRule
		if err := rows.Scan(&r.ID, &r.Name, &r.Settings, &r.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

func (s *Storage) SaveImbalanceRule(ctx context.Context, r *ImbalanceRule) error {
	if r.CreatedAt == 0 {
		r.CreatedAt = time.Now().Unix()
	}
	query := `
	INSERT INTO orderflow_imbalances (id, name, settings, created_at)
	VALUES (?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		settings = excluded.settings,
		created_at = excluded.created_at;
	`
	_, err := s.execWrite(ctx, query, r.ID, r.Name, r.Settings, r.CreatedAt)
	return err
}

func (s *Storage) DeleteImbalanceRule(ctx context.Context, id string) error {
	_, err := s.execWrite(ctx, "DELETE FROM orderflow_imbalances WHERE id = ?", id)
	return err
}

// API Key operations (encrypted via AES-256-GCM)

func (s *Storage) SaveAPIKey(ctx context.Context, provider, keyData string) error {
	storedData := keyData
	if s.cipher != nil && keyData != "" {
		encrypted, err := s.cipher.Encrypt(keyData)
		if err != nil {
			return fmt.Errorf("failed to encrypt api key for %s: %w", provider, err)
		}
		storedData = encrypted
	}

	query := `
	INSERT INTO api_keys (provider, key_data, updated_at)
	VALUES (?, ?, ?)
	ON CONFLICT(provider) DO UPDATE SET
		key_data = excluded.key_data,
		updated_at = excluded.updated_at;
	`
	_, err := s.execWrite(ctx, query, provider, storedData, time.Now().Unix())
	return err
}

func (s *Storage) GetAPIKey(ctx context.Context, provider string) (string, error) {
	var keyData string
	err := s.db.QueryRowContext(ctx, "SELECT key_data FROM api_keys WHERE provider = ?", provider).Scan(&keyData)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	if s.cipher != nil && keyData != "" {
		decrypted, err := s.cipher.Decrypt(keyData)
		if err != nil {
			return "", fmt.Errorf("failed to decrypt api key for %s: %w", provider, err)
		}
		return decrypted, nil
	}

	return keyData, nil
}

func (s *Storage) DeleteAPIKey(ctx context.Context, provider string) error {
	_, err := s.execWrite(ctx, "DELETE FROM api_keys WHERE provider = ?", provider)
	return err
}

func (s *Storage) migrateLegacyKeys(ctx context.Context) error {
	if s.cipher == nil {
		return nil
	}
	rows, err := s.db.QueryContext(ctx, "SELECT provider, key_data FROM api_keys")
	if err != nil {
		return err
	}
	defer rows.Close()

	type keyItem struct {
		provider string
		data     string
	}
	var unencrypted []keyItem
	for rows.Next() {
		var prov, data string
		if err := rows.Scan(&prov, &data); err == nil {
			if !strings.HasPrefix(data, security.EnvelopePrefix) && data != "" {
				unencrypted = append(unencrypted, keyItem{provider: prov, data: data})
			}
		}
	}
	_ = rows.Close()

	for _, item := range unencrypted {
		_ = s.SaveAPIKey(ctx, item.provider, item.data)
	}
	return nil
}

// UserIndicator operations

func (s *Storage) GetUserIndicators(ctx context.Context) ([]UserIndicator, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, name, description, code, permissions, created_at, updated_at FROM user_indicators ORDER BY updated_at DESC LIMIT 500")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []UserIndicator
	for rows.Next() {
		var ind UserIndicator
		var permsJSON string
		if err := rows.Scan(&ind.ID, &ind.Name, &ind.Description, &ind.Code, &permsJSON, &ind.CreatedAt, &ind.UpdatedAt); err != nil {
			return nil, err
		}
		if permsJSON != "" {
			_ = json.Unmarshal([]byte(permsJSON), &ind.Permissions)
		}
		if ind.Permissions == nil {
			ind.Permissions = []string{}
		}
		result = append(result, ind)
	}
	return result, rows.Err()
}

func (s *Storage) GetUserIndicator(ctx context.Context, id string) (*UserIndicator, error) {
	var ind UserIndicator
	var permsJSON string
	err := s.db.QueryRowContext(ctx, "SELECT id, name, description, code, permissions, created_at, updated_at FROM user_indicators WHERE id = ?", id).
		Scan(&ind.ID, &ind.Name, &ind.Description, &ind.Code, &permsJSON, &ind.CreatedAt, &ind.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if permsJSON != "" {
		_ = json.Unmarshal([]byte(permsJSON), &ind.Permissions)
	}
	if ind.Permissions == nil {
		ind.Permissions = []string{}
	}
	return &ind, nil
}

func (s *Storage) SaveUserIndicator(ctx context.Context, ind *UserIndicator) error {
	now := time.Now().Unix()
	if ind.ID == "" {
		ind.ID = fmt.Sprintf("user_ind_%d", time.Now().UnixNano())
	}
	if ind.CreatedAt == 0 {
		ind.CreatedAt = now
	}
	ind.UpdatedAt = now

	if ind.Permissions == nil {
		ind.Permissions = []string{}
	}
	permsBytes, err := json.Marshal(ind.Permissions)
	if err != nil {
		return fmt.Errorf("failed to marshal permissions: %w", err)
	}

	query := `
	INSERT INTO user_indicators (id, name, description, code, permissions, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		description = excluded.description,
		code = excluded.code,
		permissions = excluded.permissions,
		updated_at = excluded.updated_at
	`
	_, err = s.execWrite(ctx, query, ind.ID, ind.Name, ind.Description, ind.Code, string(permsBytes), ind.CreatedAt, ind.UpdatedAt)
	return err
}

func (s *Storage) DeleteUserIndicator(ctx context.Context, id string) error {
	_, err := s.execWrite(ctx, "DELETE FROM user_indicators WHERE id = ?", id)
	return err
}


