package storage

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestStorageLifecycle(t *testing.T) {
	tmpDB := "test_ordercraft.db"
	defer os.Remove(tmpDB)

	s, err := NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer s.Close()

	ctx := context.Background()

	// 1. Test Save & Get Layout
	layout := &Layout{
		ID:         "layout_1",
		Name:       "Default Multi-Chart",
		Symbol:     "BINANCE:BTCUSDT",
		Resolution: "15",
		Content:    `{"charts":[]}`,
		Timestamp:  time.Now().Unix(),
	}

	if err := s.SaveLayout(ctx, layout); err != nil {
		t.Fatalf("SaveLayout failed: %v", err)
	}

	fetched, err := s.GetLayout(ctx, "layout_1")
	if err != nil {
		t.Fatalf("GetLayout failed: %v", err)
	}
	if fetched == nil || fetched.Name != layout.Name || fetched.Symbol != layout.Symbol {
		t.Fatalf("Unexpected layout content: %+v", fetched)
	}

	// 2. Test GetLayouts list
	layouts, err := s.GetLayouts(ctx)
	if err != nil {
		t.Fatalf("GetLayouts failed: %v", err)
	}
	if len(layouts) != 1 {
		t.Fatalf("Expected 1 layout, got %d", len(layouts))
	}

	// 3. Test Save & Get Drawing
	drawing := &Drawing{
		ID:        "draw_trend_1",
		LayoutID:  "layout_1",
		ToolType:  "TrendLine",
		Symbol:    "BINANCE:BTCUSDT",
		Data:      `{"anchors":[{"time":1700000000,"price":50000},{"time":1700001000,"price":52000}]}`,
		Timestamp: time.Now().Unix(),
	}

	if err := s.SaveDrawing(ctx, drawing); err != nil {
		t.Fatalf("SaveDrawing failed: %v", err)
	}

	drawings, err := s.GetDrawings(ctx, "layout_1", "BINANCE:BTCUSDT")
	if err != nil {
		t.Fatalf("GetDrawings failed: %v", err)
	}
	if len(drawings) != 1 || drawings[0].ToolType != "TrendLine" {
		t.Fatalf("Unexpected drawing result: %+v", drawings)
	}

	// 4. Test Delete
	if err := s.DeleteDrawing(ctx, "draw_trend_1"); err != nil {
		t.Fatalf("DeleteDrawing failed: %v", err)
	}
	drawingsAfter, err := s.GetDrawings(ctx, "layout_1", "BINANCE:BTCUSDT")
	if err != nil {
		t.Fatalf("GetDrawings failed: %v", err)
	}
	if len(drawingsAfter) != 0 {
		t.Fatalf("Expected 0 drawings after delete, got %d", len(drawingsAfter))
	}

	// 5. Test Drawing Templates
	tmpl1 := &DrawingTemplate{
		ID:        "tmpl_eqx",
		Name:      "EQX",
		ToolType:  "trendline",
		Settings:  `{"color":"#2962ff","lineWidth":1,"lineStyle":"dashed"}`,
		CreatedAt: time.Now().Unix(),
	}
	tmpl2 := &DrawingTemplate{
		ID:        "tmpl_ob",
		Name:      "OB",
		ToolType:  "rectangle",
		Settings:  `{"color":"#089981","options":{"fillColor":"rgba(8,153,129,0.2)"}}`,
		CreatedAt: time.Now().Unix(),
	}

	if err := s.SaveDrawingTemplate(ctx, tmpl1); err != nil {
		t.Fatalf("SaveDrawingTemplate tmpl1 failed: %v", err)
	}
	if err := s.SaveDrawingTemplate(ctx, tmpl2); err != nil {
		t.Fatalf("SaveDrawingTemplate tmpl2 failed: %v", err)
	}

	// Fetch all
	allTmpls, err := s.GetDrawingTemplates(ctx, "")
	if err != nil {
		t.Fatalf("GetDrawingTemplates all failed: %v", err)
	}
	if len(allTmpls) != 2 {
		t.Fatalf("Expected 2 templates, got %d", len(allTmpls))
	}

	// Filter by tool_type
	trendTmpls, err := s.GetDrawingTemplates(ctx, "trendline")
	if err != nil {
		t.Fatalf("GetDrawingTemplates trendline failed: %v", err)
	}
	if len(trendTmpls) != 1 || trendTmpls[0].Name != "EQX" {
		t.Fatalf("Expected 1 trendline template with name EQX, got: %+v", trendTmpls)
	}

	// Delete template
	if err := s.DeleteDrawingTemplate(ctx, "tmpl_eqx"); err != nil {
		t.Fatalf("DeleteDrawingTemplate failed: %v", err)
	}
	trendTmplsAfter, err := s.GetDrawingTemplates(ctx, "trendline")
	if err != nil {
		t.Fatalf("GetDrawingTemplates after delete failed: %v", err)
	}
	if len(trendTmplsAfter) != 0 {
		t.Fatalf("Expected 0 trendline templates after delete, got %d", len(trendTmplsAfter))
	}

	// 5. Test Chart Templates
	chartTmpl1 := &ChartTemplate{
		ID:        "ctmpl_dark_pro",
		Name:      "Dark Pro Custom",
		Settings:  `{"candleBodyUpColor":"#089981","canvasBgColor":"#131722"}`,
		CreatedAt: time.Now().Unix(),
	}
	chartTmpl2 := &ChartTemplate{
		ID:        "ctmpl_light",
		Name:      "Light Minimal",
		Settings:  `{"candleBodyUpColor":"#2962ff","canvasBgColor":"#ffffff"}`,
		CreatedAt: time.Now().Unix(),
	}

	if err := s.SaveChartTemplate(ctx, chartTmpl1); err != nil {
		t.Fatalf("SaveChartTemplate chartTmpl1 failed: %v", err)
	}
	if err := s.SaveChartTemplate(ctx, chartTmpl2); err != nil {
		t.Fatalf("SaveChartTemplate chartTmpl2 failed: %v", err)
	}

	chartTmpls, err := s.GetChartTemplates(ctx)
	if err != nil {
		t.Fatalf("GetChartTemplates failed: %v", err)
	}
	if len(chartTmpls) != 2 {
		t.Fatalf("Expected 2 chart templates, got %d", len(chartTmpls))
	}

	if err := s.DeleteChartTemplate(ctx, "ctmpl_dark_pro"); err != nil {
		t.Fatalf("DeleteChartTemplate failed: %v", err)
	}
	chartTmplsAfter, err := s.GetChartTemplates(ctx)
	if err != nil {
		t.Fatalf("GetChartTemplates after delete failed: %v", err)
	}
	if len(chartTmplsAfter) != 1 || chartTmplsAfter[0].ID != "ctmpl_light" {
		t.Fatalf("Expected 1 chart template (ctmpl_light), got %+v", chartTmplsAfter)
	}
}
