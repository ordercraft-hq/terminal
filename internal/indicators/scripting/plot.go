package scripting

import (
	"fmt"
	"math"

	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"go.starlark.net/starlark"
	"go.starlark.net/starlarkstruct"
)

type PlotObject struct {
	Type        string
	Title       string
	Color       string
	ColorDown   string
	LineWidth   int
	LineStyle   string
	Overlay     bool
	Series      []float64
	LowerSeries []float64 // for bands
	Shape       string
	Text        string
}

func createPlotModule() *starlarkstruct.Struct {
	return starlarkstruct.FromStringDict(starlark.String("plot"), starlark.StringDict{
		"line":      starlark.NewBuiltin("plot.line", builtinPlotLine),
		"histogram": starlark.NewBuiltin("plot.histogram", builtinPlotHistogram),
		"band":      starlark.NewBuiltin("plot.band", builtinPlotBand),
		"signal":    starlark.NewBuiltin("plot.signal", builtinPlotSignal),
		"stepline":  starlark.NewBuiltin("plot.stepline", builtinPlotStepLine),
		"circles":   starlark.NewBuiltin("plot.circles", builtinPlotCircles),
	})
}

func starlarkValueToFloat(item starlark.Value) float64 {
	switch v := item.(type) {
	case starlark.Float:
		return float64(v)
	case starlark.Int:
		n, _ := v.Int64()
		return float64(n)
	default:
		return math.NaN()
	}
}

func extractFloatSlice(val starlark.Value) ([]float64, error) {
	if idx, ok := val.(starlark.Indexable); ok {
		n := idx.Len()
		result := make([]float64, n)
		for i := 0; i < n; i++ {
			result[i] = starlarkValueToFloat(idx.Index(i))
		}
		return result, nil
	}

	iter := starlark.Iterate(val)
	if iter == nil {
		return nil, fmt.Errorf("expected iterable for series, got %s", val.Type())
	}
	defer iter.Done()

	var capHint int
	if seq, ok := val.(starlark.Sequence); ok {
		capHint = seq.Len()
	}
	result := make([]float64, 0, capHint)
	var item starlark.Value
	for iter.Next(&item) {
		result = append(result, starlarkValueToFloat(item))
	}
	return result, nil
}

func builtinPlotLine(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		color     string = "#2962FF"
		title     string = "Line"
		lineWidth int    = 2
		lineStyle string = "solid"
		overlay   bool   = true
	)

	if err := starlark.UnpackArgs(fn.Name(), args, kwargs,
		"series", &seriesVal,
		"color?", &color,
		"title?", &title,
		"line_width?", &lineWidth,
		"line_style?", &lineStyle,
		"overlay?", &overlay,
	); err != nil {
		return nil, err
	}

	if _, ok := seriesVal.(starlark.Iterable); !ok {
		return nil, fmt.Errorf("%s: expected iterable for series, got %s", fn.Name(), seriesVal.Type())
	}

	dict := starlark.StringDict{
		"type":       starlark.String("line"),
		"title":      starlark.String(title),
		"color":      starlark.String(color),
		"line_width": starlark.MakeInt(lineWidth),
		"line_style": starlark.String(lineStyle),
		"overlay":    starlark.Bool(overlay),
		"_series":    seriesVal,
	}
	return starlarkstruct.FromStringDict(starlark.String("PlotLine"), dict), nil
}

func builtinPlotHistogram(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		color     string = "#089981"
		colorDown string = "#F23645"
		title     string = "Histogram"
		overlay   bool   = false
	)

	if err := starlark.UnpackArgs(fn.Name(), args, kwargs,
		"series", &seriesVal,
		"color?", &color,
		"color_down?", &colorDown,
		"title?", &title,
		"overlay?", &overlay,
	); err != nil {
		return nil, err
	}

	dict := starlark.StringDict{
		"type":       starlark.String("histogram"),
		"title":      starlark.String(title),
		"color":      starlark.String(color),
		"color_down": starlark.String(colorDown),
		"overlay":    starlark.Bool(overlay),
		"_series":    seriesVal,
	}
	return starlarkstruct.FromStringDict(starlark.String("PlotHistogram"), dict), nil
}

func builtinPlotBand(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		upperVal  starlark.Value
		lowerVal  starlark.Value
		fillColor string = "rgba(41, 98, 255, 0.2)"
		title     string = "Band"
	)

	if err := starlark.UnpackArgs(fn.Name(), args, kwargs,
		"upper", &upperVal,
		"lower", &lowerVal,
		"fill_color?", &fillColor,
		"title?", &title,
	); err != nil {
		return nil, err
	}

	dict := starlark.StringDict{
		"type":         starlark.String("band"),
		"title":        starlark.String(title),
		"fill_color":   starlark.String(fillColor),
		"overlay":      starlark.Bool(true),
		"_series":      upperVal,
		"_lowerSeries": lowerVal,
	}
	return starlarkstruct.FromStringDict(starlark.String("PlotBand"), dict), nil
}

func builtinPlotSignal(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		title     string = "Signal"
		shape     string = "triangle_up"
		color     string = "#089981"
		text      string = "BUY"
	)

	if err := starlark.UnpackArgs(fn.Name(), args, kwargs,
		"series", &seriesVal,
		"title?", &title,
		"shape?", &shape,
		"color?", &color,
		"text?", &text,
	); err != nil {
		return nil, err
	}

	dict := starlark.StringDict{
		"type":    starlark.String("marker"),
		"title":   starlark.String(title),
		"shape":   starlark.String(shape),
		"color":   starlark.String(color),
		"text":    starlark.String(text),
		"overlay": starlark.Bool(true),
		"_series": seriesVal,
	}
	return starlarkstruct.FromStringDict(starlark.String("PlotSignal"), dict), nil
}

func builtinPlotStepLine(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		color     string = "#2962FF"
		title     string = "StepLine"
		lineWidth int    = 2
		overlay   bool   = true
	)

	if err := starlark.UnpackArgs(fn.Name(), args, kwargs,
		"series", &seriesVal,
		"color?", &color,
		"title?", &title,
		"line_width?", &lineWidth,
		"overlay?", &overlay,
	); err != nil {
		return nil, err
	}

	dict := starlark.StringDict{
		"type":       starlark.String("stepline"),
		"title":      starlark.String(title),
		"color":      starlark.String(color),
		"line_width": starlark.MakeInt(lineWidth),
		"line_style": starlark.String("solid"),
		"overlay":    starlark.Bool(overlay),
		"_series":    seriesVal,
	}
	return starlarkstruct.FromStringDict(starlark.String("PlotStepLine"), dict), nil
}

func builtinPlotCircles(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		color     string = "#2962FF"
		title     string = "Circles"
		lineWidth int    = 2
		overlay   bool   = true
	)

	if err := starlark.UnpackArgs(fn.Name(), args, kwargs,
		"series", &seriesVal,
		"color?", &color,
		"title?", &title,
		"line_width?", &lineWidth,
		"overlay?", &overlay,
	); err != nil {
		return nil, err
	}

	dict := starlark.StringDict{
		"type":       starlark.String("circles"),
		"title":      starlark.String(title),
		"color":      starlark.String(color),
		"line_width": starlark.MakeInt(lineWidth),
		"line_style": starlark.String("solid"),
		"overlay":    starlark.Bool(overlay),
		"_series":    seriesVal,
	}
	return starlarkstruct.FromStringDict(starlark.String("PlotCircles"), dict), nil
}

// extractPlots parses the return value of main(ctx) and produces wickra plot structures.
func extractPlots(retVal starlark.Value, timestamps []int64) (*EvalResult, error) {
	result := &EvalResult{
		Plots:      make(map[string][]wickra.SeriesPoint),
		Directives: []wickra.PlotDirective{},
		Bands:      []wickra.BandDirective{},
	}

	var plotItems []starlark.Value

	switch v := retVal.(type) {
	case *starlark.List:
		for i := 0; i < v.Len(); i++ {
			plotItems = append(plotItems, v.Index(i))
		}
	case starlark.Tuple:
		for _, item := range v {
			plotItems = append(plotItems, item)
		}
	case *starlarkstruct.Struct:
		plotItems = append(plotItems, v)
	default:
		// empty or nil return
		return result, nil
	}

	plotIndex := 0
	for _, item := range plotItems {
		sObj, ok := item.(*starlarkstruct.Struct)
		if !ok {
			continue
		}

		typeVal, err := sObj.Attr("type")
		if err != nil {
			continue
		}
		plotTypeStr := ""
		if s, ok := typeVal.(starlark.String); ok {
			plotTypeStr = string(s)
		}

		title := fmt.Sprintf("Plot %d", plotIndex+1)
		if tVal, err := sObj.Attr("title"); err == nil {
			if s, ok := tVal.(starlark.String); ok {
				title = string(s)
			}
		}

		color := "#2962FF"
		if cVal, err := sObj.Attr("color"); err == nil {
			if s, ok := cVal.(starlark.String); ok {
				color = string(s)
			}
		}

		colorDown := "#F23645"
		if cdVal, err := sObj.Attr("color_down"); err == nil {
			if s, ok := cdVal.(starlark.String); ok {
				colorDown = string(s)
			}
		}

		lineWidth := 2
		if lwVal, err := sObj.Attr("line_width"); err == nil {
			if i, ok := lwVal.(starlark.Int); ok {
				if n, ok := i.Int64(); ok {
					lineWidth = int(n)
				}
			}
		}

		lineStyle := wickra.LineStyleSolid
		if lsVal, err := sObj.Attr("line_style"); err == nil {
			if s, ok := lsVal.(starlark.String); ok {
				if string(s) == "dashed" {
					lineStyle = wickra.LineStyleDashed
				} else if string(s) == "dotted" {
					lineStyle = wickra.LineStyleDotted
				}
			}
		}

		seriesVal, err := sObj.Attr("_series")
		if err != nil {
			continue
		}
		series, err := extractFloatSlice(seriesVal)
		if err != nil {
			continue
		}

		if plotTypeStr == "band" {
			fillColor := "rgba(41, 98, 255, 0.2)"
			if fcVal, err := sObj.Attr("fill_color"); err == nil {
				if s, ok := fcVal.(starlark.String); ok {
					fillColor = string(s)
				}
			}
			lowerVal, err := sObj.Attr("_lowerSeries")
			var lowerSeries []float64
			if err == nil {
				lowerSeries, _ = extractFloatSlice(lowerVal)
			}

			upperPlotID := fmt.Sprintf("plot_%d_upper", plotIndex)
			lowerPlotID := fmt.Sprintf("plot_%d_lower", plotIndex)

			isOverlayTrue := true
			upperDirective := wickra.PlotDirective{
				ID:        upperPlotID,
				Type:      wickra.PlotTypeLine,
				Title:     title + " Upper",
				Color:     color,
				LineWidth: 1,
				LineStyle: lineStyle,
				Visible:   true,
				Overlay:   &isOverlayTrue,
			}
			lowerDirective := wickra.PlotDirective{
				ID:        lowerPlotID,
				Type:      wickra.PlotTypeLine,
				Title:     title + " Lower",
				Color:     color,
				LineWidth: 1,
				LineStyle: lineStyle,
				Visible:   true,
				Overlay:   &isOverlayTrue,
			}
			result.Directives = append(result.Directives, upperDirective, lowerDirective)

			bandDirective := wickra.BandDirective{
				ID:          fmt.Sprintf("band_%d", plotIndex),
				UpperPlotID: upperPlotID,
				LowerPlotID: lowerPlotID,
				FillColor:   fillColor,
				Visible:     true,
			}
			result.Bands = append(result.Bands, bandDirective)

			for i, t := range timestamps {
				if i < len(series) && !math.IsNaN(series[i]) && !math.IsInf(series[i], 0) {
					result.Plots[upperPlotID] = append(result.Plots[upperPlotID], wickra.SeriesPoint{
						Time:  t,
						Value: series[i],
					})
				}
				if i < len(lowerSeries) && !math.IsNaN(lowerSeries[i]) && !math.IsInf(lowerSeries[i], 0) {
					result.Plots[lowerPlotID] = append(result.Plots[lowerPlotID], wickra.SeriesPoint{
						Time:  t,
						Value: lowerSeries[i],
					})
				}
			}

			plotIndex++
			continue
		}

		plotID := fmt.Sprintf("plot_%d", plotIndex)
		var pType wickra.PlotType
		switch plotTypeStr {
		case "histogram":
			pType = wickra.PlotTypeHistogram
		case "stepline":
			pType = wickra.PlotTypeStepLine
		case "circles":
			pType = wickra.PlotTypeCircles
		case "marker":
			pType = wickra.PlotTypeMarker
		default:
			pType = wickra.PlotTypeLine
		}

		var overlayPtr *bool
		if oVal, err := sObj.Attr("overlay"); err == nil {
			if b, ok := oVal.(starlark.Bool); ok {
				isO := bool(b)
				overlayPtr = &isO
			}
		}

		directive := wickra.PlotDirective{
			ID:        plotID,
			Type:      pType,
			Title:     title,
			Color:     color,
			ColorUp:   color,
			ColorDown: colorDown,
			LineWidth: lineWidth,
			LineStyle: lineStyle,
			Visible:   true,
			Overlay:   overlayPtr,
		}
		result.Directives = append(result.Directives, directive)

		for i, t := range timestamps {
			if i < len(series) {
				val := series[i]
				if !math.IsNaN(val) && !math.IsInf(val, 0) {
					ptColor := color
					if plotTypeStr == "histogram" && val < 0 {
						ptColor = colorDown
					}
					result.Plots[plotID] = append(result.Plots[plotID], wickra.SeriesPoint{
						Time:  t,
						Value: val,
						Color: ptColor,
					})
				}
			}
		}

		plotIndex++
	}

	return result, nil
}
