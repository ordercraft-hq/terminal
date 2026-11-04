package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ordercraft-hq/terminal/internal/calendar"
	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/datafeed/providers"
	"github.com/ordercraft-hq/terminal/internal/news"
	"github.com/ordercraft-hq/terminal/internal/screener"
	"github.com/ordercraft-hq/terminal/internal/storage"
	"github.com/ordercraft-hq/terminal/internal/watchlist"
)

type Server struct {
	storage      *storage.Storage
	coordinator  *datafeed.Coordinator
	streamHub    *StreamHub
	calendarSvc  *calendar.Service
	newsSvc      *news.Service
	screenerSvc  *screener.Service
	watchlistSvc *watchlist.Service
	alpacaProv   *providers.AlpacaProvider
	oandaProv    *providers.OandaProvider
	mux          *http.ServeMux
	server       *http.Server
}

func NewServer(s *storage.Storage) *Server {
	coord := datafeed.NewCoordinator()
	coord.RegisterProvider(providers.NewBinanceProvider())
	coord.RegisterProvider(providers.NewBybitProvider())
	coord.RegisterProvider(providers.NewCoinbaseProvider())
	coord.RegisterAlias("COINBASEPRO", "COINBASE")
	coord.RegisterAlias("GDAX", "COINBASE")
	alpacaProv := providers.NewAlpacaProvider()
	coord.RegisterProvider(alpacaProv)
	coord.RegisterAlias("ALPACA", alpacaProv.Name())
	oandaProv := providers.NewOandaProvider()
	coord.RegisterProvider(oandaProv)

	// Restore any credentials saved in database
	if s != nil {
		if rawKey, err := s.GetAPIKey(context.Background(), "ALPACA"); err == nil && rawKey != "" {
			var creds struct {
				APIKey    string `json:"apiKey"`
				APISecret string `json:"apiSecret"`
			}
			if json.Unmarshal([]byte(rawKey), &creds) == nil && creds.APIKey != "" {
				alpacaProv.SetCredentials(creds.APIKey, creds.APISecret)
			}
		}
		if rawKey, err := s.GetAPIKey(context.Background(), "OANDA"); err == nil && rawKey != "" {
			var creds struct {
				AccountID string `json:"accountId"`
				APIKey    string `json:"apiKey"`
				APISecret string `json:"apiSecret"`
			}
			if json.Unmarshal([]byte(rawKey), &creds) == nil && creds.APIKey != "" {
				oandaProv.SetCredentials(creds.AccountID, creds.APIKey, creds.APISecret)
			}
		}
	}

	hub := NewStreamHub(coord)

	wlSvc := watchlist.NewService()
	srv := &Server{
		storage:      s,
		coordinator:  coord,
		streamHub:    hub,
		calendarSvc:  calendar.NewService(),
		newsSvc:      news.NewService(),
		watchlistSvc: wlSvc,
		screenerSvc:  screener.NewService(),
		alpacaProv:   alpacaProv,
		oandaProv:    oandaProv,
		mux:          http.NewServeMux(),
	}

	srv.routes()
	return srv
}

// SetStaticFS mounts an embedded or disk filesystem as the root SPA handler with fallback to index.html.
func (s *Server) SetStaticFS(staticFS fs.FS) {
	if staticFS == nil {
		return
	}
	fileServer := http.FileServer(http.FS(staticFS))
	s.mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Never intercept API, WS, or docs endpoints
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" || strings.HasPrefix(r.URL.Path, "/docs/") {
			return
		}

		cleanPath := strings.TrimPrefix(r.URL.Path, "/")
		if cleanPath == "" {
			cleanPath = "index.html"
		}

		// Try opening the exact asset
		f, err := staticFS.Open(cleanPath)
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA Fallback: serve index.html for client-side routing
		indexF, err := staticFS.Open("index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer indexF.Close()

		stat, _ := indexF.Stat()
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if stat != nil {
			if rSeeker, ok := indexF.(io.ReadSeeker); ok {
				http.ServeContent(w, r, "index.html", stat.ModTime(), rSeeker)
				return
			}
		}
		data, _ := io.ReadAll(indexF)
		w.Write(data)
	})
}

func (s *Server) routes() {
	// CORS Middleware wrapper
	s.mux.HandleFunc("/api/datafeed/candles", s.handleGetCandles)
	s.mux.HandleFunc("/api/datafeed/symbols", s.handleSearchSymbols)

	// Unified real-time WebSocket stream relay
	s.mux.HandleFunc("/ws", s.streamHub.ServeHTTP)

	// Watchlist batch quotes and search
	s.mux.HandleFunc("/api/watchlist/quotes", s.handleWatchlistQuotes)
	s.mux.HandleFunc("/api/watchlist/search", s.handleWatchlistSearch)

	// Economic Calendar endpoints
	s.mux.HandleFunc("/api/calendar", s.handleCalendar)

	// Financial News endpoints
	s.mux.HandleFunc("/api/news", s.handleNews)

	// Market Movers / Screener endpoints
	s.mux.HandleFunc("/api/movers", s.handleMovers)

	// Data Providers & Health Status endpoints
	s.mux.HandleFunc("/api/providers/status", s.handleProvidersStatus)
	s.mux.HandleFunc("/api/providers/configure", s.handleProviderConfigure)
	s.mux.Handle("/docs/", http.StripPrefix("/docs/", http.FileServer(http.Dir("./docs"))))

	// Layout endpoints
	s.mux.HandleFunc("/api/layout/", s.handleLayouts)

	// Drawing endpoints
	s.mux.HandleFunc("/api/drawings", s.handleDrawings)

	// Drawing Templates endpoints
	s.mux.HandleFunc("/api/templates/drawings", s.handleDrawingTemplates)

	// Chart Templates endpoints
	s.mux.HandleFunc("/api/templates/charts", s.handleChartTemplates)

	// Health check
	s.mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if !enableCORS(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","app":"ORDERCRAFT"}`))
	})
}

func (s *Server) handleGetCandles(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	q := r.URL.Query()
	fullSymbol := q.Get("symbol")
	if fullSymbol == "" {
		fullSymbol = "BINANCE:BTCUSDT"
	}
	resolution := q.Get("resolution")
	if resolution == "" {
		resolution = "15m"
	}

	from, _ := strconv.ParseInt(q.Get("from"), 10, 64)
	to, _ := strconv.ParseInt(q.Get("to"), 10, 64)
	count, _ := strconv.Atoi(q.Get("count"))
	if count <= 0 {
		count = 200
	}

	candles, err := s.coordinator.GetCandles(r.Context(), fullSymbol, resolution, from, to, count)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"candles": candles,
		"s":       "ok",
		"symbol":  fullSymbol,
	})
}

func (s *Server) handleSearchSymbols(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	query := r.URL.Query().Get("query")
	results, err := s.coordinator.SearchSymbols(r.Context(), query)
	if err != nil || results == nil {
		results = []datafeed.SymbolInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (s *Server) handleLayouts(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	// Path parsing: /api/layout/ or /api/layout/{id}
	path := strings.TrimPrefix(r.URL.Path, "/api/layout")
	path = strings.Trim(path, "/")

	ctx := r.Context()

	switch r.Method {
	case http.MethodGet:
		if path == "" {
			// Get all layouts
			layouts, err := s.storage.GetLayouts(ctx)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if layouts == nil {
				layouts = []storage.Layout{}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(layouts)
			return
		}

		// Get single layout by ID
		layout, err := s.storage.GetLayout(ctx, path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if layout == nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":          layout.ID,
			"name":        layout.Name,
			"symbol":      layout.Symbol,
			"resolution":  layout.Resolution,
			"content":     layout.Content,
			"timestamp":   layout.Timestamp,
			"is_favorite": layout.IsFavorite,
		})

	case http.MethodPost:
		// Save layout (limit 10 MB payload)
		r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
		var req struct {
			Layout storage.Layout `json:"layout"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json body", http.StatusBadRequest)
			return
		}
		if req.Layout.ID == "" {
			req.Layout.ID = fmt.Sprintf("layout_%d", time.Now().UnixMilli())
		}
		if err := s.storage.SaveLayout(ctx, &req.Layout); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"id": req.Layout.ID, "status": "saved"})

	case http.MethodPatch:
		if path == "" {
			http.Error(w, "missing layout id", http.StatusBadRequest)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			Name       *string `json:"name"`
			IsFavorite *bool   `json:"is_favorite"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json body", http.StatusBadRequest)
			return
		}
		if err := s.storage.UpdateLayoutMeta(ctx, path, req.Name, req.IsFavorite); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})

	case http.MethodDelete:
		if path == "" {
			http.Error(w, "missing layout id", http.StatusBadRequest)
			return
		}
		if err := s.storage.DeleteLayout(ctx, path); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleDrawings(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	ctx := r.Context()

	switch r.Method {
	case http.MethodGet:
		layoutID := r.URL.Query().Get("layout_id")
		symbol := r.URL.Query().Get("symbol")
		drawings, err := s.storage.GetDrawings(ctx, layoutID, symbol)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if drawings == nil {
			drawings = []storage.Drawing{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(drawings)

	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
		var d storage.Drawing
		if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		if d.ID == "" {
			d.ID = fmt.Sprintf("draw_%d", time.Now().UnixMilli())
		}
		if err := s.storage.SaveDrawing(ctx, &d); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(d)

	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id != "" {
			if err := s.storage.DeleteDrawing(ctx, id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		layoutID := r.URL.Query().Get("layout_id")
		symbol := r.URL.Query().Get("symbol")
		if err := s.storage.ClearDrawings(ctx, layoutID, symbol); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleDrawingTemplates(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	ctx := r.Context()

	switch r.Method {
	case http.MethodGet:
		toolType := r.URL.Query().Get("tool_type")
		templates, err := s.storage.GetDrawingTemplates(ctx, toolType)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if templates == nil {
			templates = []storage.DrawingTemplate{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(templates)

	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
		var t storage.DrawingTemplate
		if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
			http.Error(w, "invalid json body", http.StatusBadRequest)
			return
		}
		if t.ID == "" {
			t.ID = fmt.Sprintf("tmpl_%d", time.Now().UnixMilli())
		}
		if t.Name == "" {
			http.Error(w, "template name cannot be empty", http.StatusBadRequest)
			return
		}
		if err := s.storage.SaveDrawingTemplate(ctx, &t); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(t)

	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "missing template id", http.StatusBadRequest)
			return
		}
		if err := s.storage.DeleteDrawingTemplate(ctx, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleChartTemplates(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	ctx := r.Context()

	switch r.Method {
	case http.MethodGet:
		templates, err := s.storage.GetChartTemplates(ctx)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if templates == nil {
			templates = []storage.ChartTemplate{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(templates)

	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
		var t storage.ChartTemplate
		if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
			http.Error(w, "invalid json body", http.StatusBadRequest)
			return
		}
		if t.ID == "" {
			t.ID = fmt.Sprintf("chart_tmpl_%d", time.Now().UnixMilli())
		}
		if t.Name == "" {
			http.Error(w, "template name cannot be empty", http.StatusBadRequest)
			return
		}
		if err := s.storage.SaveChartTemplate(ctx, &t); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(t)

	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "missing template id", http.StatusBadRequest)
			return
		}
		if err := s.storage.DeleteChartTemplate(ctx, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleWatchlistQuotes(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	symbolsParam := r.URL.Query().Get("symbols")
	if symbolsParam == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"quotes": []interface{}{}, "s": "ok"})
		return
	}

	rawSymbols := strings.Split(symbolsParam, ",")
	quotes, err := s.watchlistSvc.GetQuotes(r.Context(), rawSymbols)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"quotes": quotes,
		"count":  len(quotes),
		"s":      "ok",
	})
}

func (s *Server) handleWatchlistSearch(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	q := r.URL.Query().Get("q")
	items, err := s.watchlistSvc.Search(r.Context(), q)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": items,
		"count":   len(items),
		"s":       "ok",
	})
}

func (s *Server) handleCalendar(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	impact := r.URL.Query().Get("impact")
	country := r.URL.Query().Get("country")
	refresh := r.URL.Query().Get("refresh") == "true" || r.URL.Query().Get("force") == "true"

	events, err := s.calendarSvc.GetEventsWithOpts(r.Context(), impact, country, refresh)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"events": events,
		"count":  len(events),
		"s":      "ok",
	})
}

func (s *Server) handleNews(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	q := r.URL.Query().Get("q")
	if q == "" {
		symbol := r.URL.Query().Get("symbol")
		if symbol != "" {
			// Strip prefix like BINANCE: or OANDA:
			clean := symbol
			if idx := strings.Index(clean, ":"); idx != -1 {
				clean = clean[idx+1:]
			}
			clean = strings.ReplaceAll(clean, "_USD", "")
			clean = strings.ReplaceAll(clean, "USDT", "")
			q = clean + " stock market"
		}
	}

	refresh := r.URL.Query().Get("refresh") == "true" || r.URL.Query().Get("force") == "true"
	articles, err := s.newsSvc.GetNewsWithOpts(r.Context(), q, refresh)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"articles": articles,
		"query":    q,
		"count":    len(articles),
		"s":        "ok",
	})
}

func (s *Server) handleMovers(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	category := r.URL.Query().Get("category")
	refresh := r.URL.Query().Get("refresh") == "true" || r.URL.Query().Get("force") == "true"

	movers, err := s.screenerSvc.GetMoversWithOpts(r.Context(), category, refresh)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"category":   movers.Category,
		"categories": screener.YFinanceCategories,
		"gainers":    movers.Gainers,
		"losers":     movers.Losers,
		"volume":     movers.Volume,
		"s":          "ok",
	})
}

func (s *Server) handleProvidersStatus(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	var provList []map[string]interface{}
	var availList []map[string]interface{}

	if s.coordinator != nil {
		for _, p := range s.coordinator.Providers() {
			id := strings.ToUpper(p.Name())
			intervals := p.SupportedResolutions()
			info := map[string]interface{}{
				"id":                 id,
				"name":               p.Name(),
				"status":             "connected",
				"supportedIntervals": intervals,
			}
			switch id {
			case "BINANCE":
				info["name"] = "Binance Public Spot & Futures"
				info["type"] = "crypto"
				info["latencyMs"] = 35
				provList = append(provList, info)
			case "BYBIT":
				info["name"] = "Bybit v5 Public & Derivatives"
				info["type"] = "crypto"
				info["latencyMs"] = 42
				provList = append(provList, info)
			case "COINBASE":
				info["name"] = "Coinbase Advanced (Spot & Perpetuals)"
				info["type"] = "crypto"
				info["latencyMs"] = 48
				provList = append(provList, info)
			case "ALPACA":
				info["name"] = "Alpaca Markets (US Equities & Crypto)"
				info["type"] = "stock"
				info["latencyMs"] = 45
				info["docUrl"] = "https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/Alpaca.md"

				var accountID, maskedKey string
				var hasSecret, hasKey bool
				if s.storage != nil {
					if raw, err := s.storage.GetAPIKey(r.Context(), "ALPACA"); err == nil && raw != "" {
						var creds struct {
							AccountID string `json:"accountId"`
							APIKey    string `json:"apiKey"`
							APISecret string `json:"apiSecret"`
						}
						if json.Unmarshal([]byte(raw), &creds) == nil {
							accountID = creds.AccountID
							if creds.APIKey != "" {
								maskedKey = maskKeyString(creds.APIKey)
								hasKey = true
							}
							if creds.APISecret != "" {
								hasSecret = true
							}
						}
					}
				}
				if !hasKey && s.alpacaProv != nil && s.alpacaProv.IsConfigured() {
					key, sec := s.alpacaProv.RawCredentials()
					maskedKey = maskKeyString(key)
					hasKey = key != ""
					hasSecret = sec != ""
				}

				if s.alpacaProv != nil && s.alpacaProv.IsConfigured() {
					info["accountId"] = accountID
					info["maskedApiKey"] = maskedKey
					info["hasKey"] = hasKey
					info["hasSecret"] = hasSecret
					provList = append(provList, info)
				} else {
					availList = append(availList, map[string]interface{}{
						"id":           "ALPACA",
						"name":         "Alpaca Markets (US Equities & Crypto)",
						"category":     "Stocks & Multi-Asset",
						"authType":     "API Key + Secret",
						"status":       "available",
						"docUrl":       "https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/Alpaca.md",
						"accountId":    accountID,
						"maskedApiKey": maskedKey,
						"hasKey":       hasKey,
						"hasSecret":    hasSecret,
					})
				}
			case "OANDA":
				info["name"] = "OANDA v20 Rest & Stream"
				info["type"] = "forex_cfd"
				info["latencyMs"] = 58
				info["docUrl"] = "https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/Oanda.md"

				var accountID, maskedKey, savedSecret string
				var hasSecret, hasKey bool
				if s.storage != nil {
					if raw, err := s.storage.GetAPIKey(r.Context(), "OANDA"); err == nil && raw != "" {
						var creds struct {
							AccountID string `json:"accountId"`
							APIKey    string `json:"apiKey"`
							APISecret string `json:"apiSecret"`
						}
						if json.Unmarshal([]byte(raw), &creds) == nil {
							accountID = creds.AccountID
							savedSecret = creds.APISecret
							if creds.APIKey != "" {
								maskedKey = maskKeyString(creds.APIKey)
								hasKey = true
							}
							if creds.APISecret != "" {
								hasSecret = true
							}
						}
					}
				}
				if !hasKey && s.oandaProv != nil && s.oandaProv.IsConfigured() {
					acc, tok, env := s.oandaProv.RawCredentials()
					accountID = acc
					maskedKey = maskKeyString(tok)
					savedSecret = env
					hasKey = tok != ""
					hasSecret = env != ""
				}

				// Ensure environment string is strictly "live" or "practice", never echoing raw tokens
				if savedSecret != "live" {
					savedSecret = "practice"
				}

				if s.oandaProv != nil && s.oandaProv.IsConfigured() {
					info["accountId"] = accountID
					info["maskedApiKey"] = maskedKey
					info["hasKey"] = hasKey
					info["hasSecret"] = hasSecret
					info["savedSecret"] = savedSecret
					provList = append(provList, info)
				} else {
					availList = append(availList, map[string]interface{}{
						"id":           "OANDA",
						"name":         "OANDA v20 Rest & Stream",
						"category":     "Forex & CFD",
						"authType":     "Personal Access Token",
						"status":       "available",
						"docUrl":       "https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/Oanda.md",
						"accountId":    accountID,
						"maskedApiKey": maskedKey,
						"hasKey":       hasKey,
						"hasSecret":    hasSecret,
						"savedSecret":  savedSecret,
					})
				}
			default:
				info["type"] = "custom"
				info["latencyMs"] = 10
				provList = append(provList, info)
			}
		}
	}

	twelveDoc := "https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/TwelveData.md"
	ibkrDoc := "https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/InteractiveBrokers.md"

	twelveItem := map[string]interface{}{
		"id":       "TWELVEDATA",
		"name":     "Twelve Data",
		"category": "Multi-Asset Global",
		"authType": "API Key",
		"status":   "coming_soon",
		"docUrl":   twelveDoc,
	}
	ibkrItem := map[string]interface{}{
		"id":       "IBKR",
		"name":     "Interactive Brokers (TWS)",
		"category": "Global Brokerage",
		"authType": "Gateway",
		"status":   "coming_soon",
		"docUrl":   ibkrDoc,
	}

	if s.storage != nil {
		if raw, err := s.storage.GetAPIKey(r.Context(), "TWELVEDATA"); err == nil && raw != "" {
			var creds struct {
				AccountID string `json:"accountId"`
				APIKey    string `json:"apiKey"`
				APISecret string `json:"apiSecret"`
			}
			if json.Unmarshal([]byte(raw), &creds) == nil {
				twelveItem["accountId"] = creds.AccountID
				if creds.APIKey != "" {
					twelveItem["maskedApiKey"] = maskKeyString(creds.APIKey)
					twelveItem["hasKey"] = true
				}
				twelveItem["hasSecret"] = creds.APISecret != ""
			}
		}
		if raw, err := s.storage.GetAPIKey(r.Context(), "IBKR"); err == nil && raw != "" {
			var creds struct {
				AccountID string `json:"accountId"`
				APIKey    string `json:"apiKey"`
				APISecret string `json:"apiSecret"`
			}
			if json.Unmarshal([]byte(raw), &creds) == nil {
				ibkrItem["accountId"] = creds.AccountID
				if creds.APIKey != "" {
					ibkrItem["maskedApiKey"] = maskKeyString(creds.APIKey)
					ibkrItem["hasKey"] = true
				}
				ibkrItem["hasSecret"] = creds.APISecret != ""
			}
		}
	}

	availList = append(availList, twelveItem, ibkrItem)

	// Sort providers for deterministic UI ordering: BINANCE, BYBIT, COINBASE, ALPACA, OANDA, etc.
	sort.Slice(provList, func(i, j int) bool {
		order := map[string]int{"BINANCE": 1, "BYBIT": 2, "COINBASE": 3, "ALPACA": 4, "OANDA": 5}
		idI := provList[i]["id"].(string)
		idJ := provList[j]["id"].(string)
		oI, okI := order[idI]
		if !okI {
			oI = 99
		}
		oJ, okJ := order[idJ]
		if !okJ {
			oJ = 99
		}
		if oI != oJ {
			return oI < oJ
		}
		return idI < idJ
	})

	resp := map[string]interface{}{
		"count":                 len(provList),
		"providers":             provList,
		"availableIntegrations": availList,
		"s":                     "ok",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func maskKeyString(s string) string {
	s = strings.TrimSpace(s)
	n := len(s)
	if n == 0 {
		return ""
	}
	if n <= 6 {
		return strings.Repeat("•", n)
	}
	if n <= 10 {
		return s[:2] + strings.Repeat("•", n-4) + s[n-2:]
	}
	return s[:4] + "••••••••" + s[n-4:]
}

type ProviderConfigureRequest struct {
	Provider  string `json:"provider"`
	AccountID string `json:"accountId"`
	APIKey    string `json:"apiKey"`
	APISecret string `json:"apiSecret"`
}

func (s *Server) handleProviderConfigure(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodPost {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req ProviderConfigureRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return
		}

		provID := strings.ToUpper(strings.TrimSpace(req.Provider))

		// Check for existing stored credentials so unedited/masked fields are preserved
		var existing ProviderConfigureRequest
		if s.storage != nil {
			if raw, err := s.storage.GetAPIKey(r.Context(), provID); err == nil && raw != "" {
				_ = json.Unmarshal([]byte(raw), &existing)
			}
		}

		// Also check in-memory providers as fallback for existing credentials
		if provID == "ALPACA" && s.alpacaProv != nil {
			k, sec := s.alpacaProv.RawCredentials()
			if existing.APIKey == "" {
				existing.APIKey = k
			}
			if existing.APISecret == "" {
				existing.APISecret = sec
			}
		} else if provID == "OANDA" && s.oandaProv != nil {
			acc, tok, env := s.oandaProv.RawCredentials()
			if existing.AccountID == "" {
				existing.AccountID = acc
			}
			if existing.APIKey == "" {
				existing.APIKey = tok
			}
			if existing.APISecret == "" {
				existing.APISecret = env
			}
		}

		accountID := strings.TrimSpace(req.AccountID)
		if accountID == "" && existing.AccountID != "" {
			accountID = existing.AccountID
		}

		apiKey := strings.TrimSpace(req.APIKey)
		// If apiKey is empty or contains masked bullets "•", preserve existing real key
		if (apiKey == "" || strings.Contains(apiKey, "•")) && existing.APIKey != "" {
			apiKey = existing.APIKey
		}

		apiSecret := strings.TrimSpace(req.APISecret)
		// If apiSecret is empty or contains masked bullets "•", preserve existing real secret
		if (apiSecret == "" || strings.Contains(apiSecret, "•")) && existing.APISecret != "" {
			apiSecret = existing.APISecret
		}

		saved := ProviderConfigureRequest{
			Provider:  provID,
			AccountID: accountID,
			APIKey:    apiKey,
			APISecret: apiSecret,
		}

		switch provID {
		case "ALPACA":
			if s.alpacaProv != nil {
				s.alpacaProv.SetCredentials(apiKey, apiSecret)
			}
			if s.storage != nil {
				keyData, _ := json.Marshal(saved)
				_ = s.storage.SaveAPIKey(r.Context(), "ALPACA", string(keyData))
			}
		case "OANDA":
			if s.oandaProv != nil {
				s.oandaProv.SetCredentials(accountID, apiKey, apiSecret)
			}
			if s.storage != nil {
				keyData, _ := json.Marshal(saved)
				_ = s.storage.SaveAPIKey(r.Context(), "OANDA", string(keyData))
			}
		case "TWELVEDATA", "IBKR":
			http.Error(w, fmt.Sprintf(`{"error":"%s feed adapter is in development for an upcoming release"}`, provID), http.StatusBadRequest)
			return
		default:
			http.Error(w, `{"error":"unsupported provider"}`, http.StatusBadRequest)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"s":        "ok",
			"provider": provID,
			"status":   "configured",
		})
		return
	}

	if r.Method == http.MethodDelete {
		provID := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("provider")))
		if provID == "ALPACA" && s.alpacaProv != nil {
			s.alpacaProv.SetCredentials("", "")
		} else if provID == "OANDA" && s.oandaProv != nil {
			s.oandaProv.SetCredentials("", "", "")
		}
		if s.storage != nil {
			_ = s.storage.DeleteAPIKey(r.Context(), provID)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"s":        "ok",
			"provider": provID,
			"status":   "disconnected",
		})
		return
	}

	http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
}

func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return true // Same-origin or non-browser client
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	hostname := strings.ToLower(u.Hostname())
	return hostname == "localhost" || hostname == "127.0.0.1" || hostname == "::1" || hostname == "[::1]"
}

func enableCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin != "" {
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		} else {
			// External origin attempting cross-origin access to localhost workstation
			if r.Method == http.MethodOptions {
				http.Error(w, `{"error":"forbidden origin"}`, http.StatusForbidden)
				return false
			}
			// Block unsafe cross-origin state changes to protect against localhost CSRF
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				http.Error(w, `{"error":"forbidden cross-origin mutation"}`, http.StatusForbidden)
				return false
			}
			// For cross-origin GET requests from untrusted origins, do NOT set Access-Control-Allow-Origin
			// so the browser's Same-Origin Policy will block the script from reading response data.
		}
	} else {
		// Same-origin or direct API client
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	}

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return false
	}
	return true
}

func (s *Server) Start(addr string) error {
	s.server = &http.Server{
		Addr:              addr,
		Handler:           s.mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MB
	}
	log.Printf("[ORDERCRAFT] Server listening on %s\n", addr)
	return s.server.ListenAndServe()
}

func (s *Server) Serve(listener net.Listener) error {
	s.server = &http.Server{
		Handler:           s.mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MB
	}
	log.Printf("[ORDERCRAFT] Server listening on %s\n", listener.Addr().String())
	return s.server.Serve(listener)
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.server != nil {
		return s.server.Shutdown(ctx)
	}
	return nil
}
