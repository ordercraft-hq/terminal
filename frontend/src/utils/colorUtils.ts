/**
 * Color math and parsing utilities for ORDERCRAFT's Pro Color Picker.
 * Supports HEX (#RGB, #RRGGBB, #RRGGBBAA), RGB/RGBA, and HSV conversions.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number; // 0..1
}

export interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export interface ParsedColor extends RGBA {
  hex: string; // #rrggbb (uppercase)
  h: number;
  s: number;
  v: number;
}

// Convert 0..255 number to 2-char hex
export function toHex(n: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(n)));
  return clamped.toString(16).padStart(2, '0').toUpperCase();
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h: Math.round(h), s, v };
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hNorm = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = v - c;

  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (hNorm < 60) {
    rn = c;
    gn = x;
    bn = 0;
  } else if (hNorm < 120) {
    rn = x;
    gn = c;
    bn = 0;
  } else if (hNorm < 180) {
    rn = 0;
    gn = c;
    bn = x;
  } else if (hNorm < 240) {
    rn = 0;
    gn = x;
    bn = c;
  } else if (hNorm < 300) {
    rn = x;
    gn = 0;
    bn = c;
  } else {
    rn = c;
    gn = 0;
    bn = x;
  }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

export function parseColor(colorStr?: string): ParsedColor {
  const fallback: ParsedColor = {
    r: 8,
    g: 153,
    b: 129,
    a: 1,
    hex: '#089981',
    h: 170,
    s: 0.95,
    v: 0.6,
  };

  if (!colorStr || typeof colorStr !== 'string') return fallback;
  const str = colorStr.trim().toLowerCase();

  // 1. Check HEX (#RGB, #RGBA, #RRGGBB, #RRGGBBAA)
  if (str.startsWith('#')) {
    const raw = str.slice(1);
    if (raw.length === 3) {
      const r = parseInt(raw[0] + raw[0], 16) || 0;
      const g = parseInt(raw[1] + raw[1], 16) || 0;
      const b = parseInt(raw[2] + raw[2], 16) || 0;
      const hsv = rgbToHsv(r, g, b);
      return { r, g, b, a: 1, hex: rgbToHex(r, g, b), ...hsv };
    }
    if (raw.length === 4) {
      const r = parseInt(raw[0] + raw[0], 16) || 0;
      const g = parseInt(raw[1] + raw[1], 16) || 0;
      const b = parseInt(raw[2] + raw[2], 16) || 0;
      const a = (parseInt(raw[3] + raw[3], 16) || 255) / 255;
      const hsv = rgbToHsv(r, g, b);
      return { r, g, b, a, hex: rgbToHex(r, g, b), ...hsv };
    }
    if (raw.length === 6) {
      const r = parseInt(raw.slice(0, 2), 16) || 0;
      const g = parseInt(raw.slice(2, 4), 16) || 0;
      const b = parseInt(raw.slice(4, 6), 16) || 0;
      const hsv = rgbToHsv(r, g, b);
      return { r, g, b, a: 1, hex: rgbToHex(r, g, b), ...hsv };
    }
    if (raw.length === 8) {
      const r = parseInt(raw.slice(0, 2), 16) || 0;
      const g = parseInt(raw.slice(2, 4), 16) || 0;
      const b = parseInt(raw.slice(4, 6), 16) || 0;
      const a = (parseInt(raw.slice(6, 8), 16) || 255) / 255;
      const hsv = rgbToHsv(r, g, b);
      return { r, g, b, a, hex: rgbToHex(r, g, b), ...hsv };
    }
  }

  // 2. Check RGB / RGBA: rgb(255, 255, 255) or rgba(8, 153, 129, 0.5)
  const rgbMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[1]) || 0)));
    const g = Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[2]) || 0)));
    const b = Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[3]) || 0)));
    const a = rgbMatch[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(rgbMatch[4]))) : 1;
    const hsv = rgbToHsv(r, g, b);
    return { r, g, b, a, hex: rgbToHex(r, g, b), ...hsv };
  }

  return fallback;
}

export function formatColorOutput(r: number, g: number, b: number, a = 1): string {
  const roundedA = Math.round(a * 100) / 100;
  if (roundedA >= 0.999) {
    return rgbToHex(r, g, b).toLowerCase();
  }
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${roundedA})`;
}

/**
 * Checks if a color is light using standard relative luminance.
 * Returns true if luminance > 140 (0..255 range).
 */
export function isLightColor(colorStr?: string): boolean {
  if (!colorStr) return false;
  const parsed = parseColor(colorStr);
  const luminance = 0.299 * parsed.r + 0.587 * parsed.g + 0.114 * parsed.b;
  return luminance > 140;
}

// 80 Pro Palette Colors (10 columns x 8 rows)
export const PRO_PALETTE_GRID: string[][] = [
  // Row 0: Monochrome Greyscale
  ['#ffffff', '#e0e3eb', '#b2b5be', '#787b86', '#5d606b', '#434651', '#2a2e39', '#1e222d', '#131722', '#000000'],
  // Row 1: Vivid Primary & Secondary Hues
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
  // Row 2: Lightest Pastel Tints
  ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb', '#b2ebf2', '#bbdefb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
  // Row 3: Soft Pastel Tints
  ['#f9989d', '#ffcc80', '#fff59d', '#a5d6a7', '#80cbc4', '#80deea', '#90caf9', '#b39ddb', '#ce93d8', '#f48fb1'],
  // Row 4: Medium Tints
  ['#ef5350', '#ffb74d', '#ffee58', '#81c784', '#4db6ac', '#4dd0e1', '#64b5f6', '#9575cd', '#ba68c8', '#f06292'],
  // Row 5: True Saturated Tones
  ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b', '#00acc1', '#1e88e5', '#5e35b1', '#8e24aa', '#d81b60'],
  // Row 6: Deep Shades
  ['#c62828', '#ef6c00', '#f9a825', '#2e7d32', '#00695c', '#00838f', '#1565c0', '#4527a0', '#6a1b9a', '#ad1457'],
  // Row 7: Darkest Shades
  ['#880e4f', '#bf360c', '#f57f17', '#1b5e20', '#004d40', '#006064', '#0d47a1', '#311b92', '#4a148c', '#880e4f'],
];

// Initial Custom Colors Row (persisted in localStorage, starts completely empty)
export const DEFAULT_CUSTOM_COLORS: string[] = [];

