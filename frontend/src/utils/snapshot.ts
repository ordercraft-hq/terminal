/**
 * Helper to capture chart workstation screenshots (single chart or multi-chart layout)
 * and save as a pristine PNG or copy directly to clipboard.
 * Composites all panes in the layout side-by-side / in grid, preserving exact relative
 * coordinates, price scales on the right, time scales on the bottom, drawing layers,
 * layout dividers, and pro watermark branding.
 */
export async function captureChartSnapshot(
  symbol: string,
  timeframe: string,
  mode: 'download' | 'copy' = 'download'
): Promise<boolean> {
  try {
    // 1. Locate the multi-chart grid container, or fallback to single chart container
    const container: HTMLElement | null =
      document.querySelector('.workspace-grid-container') ||
      document.querySelector('.chart-viewport-wrapper[data-active-pane="true"]') ||
      document.querySelector('.chart-pane-wrapper[data-active-pane="true"]') ||
      document.querySelector('.chart-viewport-wrapper') ||
      document.querySelector('.chart-pane-canvas')?.parentElement ||
      document.querySelector('.chart-pane-canvas');

    if (!container) {
      console.error('[Snapshot] No chart or workspace container element found');
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    if (containerRect.width <= 0 || containerRect.height <= 0) {
      console.error('[Snapshot] Chart container has invalid zero dimensions');
      return false;
    }

    // 2. Discover all rendered canvas layers inside this container
    const allCanvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[];
    const validCanvases = allCanvases.filter((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && c.width > 0 && c.height > 0;
    });

    if (validCanvases.length === 0) {
      console.error('[Snapshot] No valid rendered canvas found inside chart container');
      return false;
    }

    // Determine output device pixel ratio (HiDPI crisp rendering)
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const targetWidth = Math.round(containerRect.width * dpr);
    const targetHeight = Math.round(containerRect.height * dpr);

    const mergedCanvas = document.createElement('canvas');
    mergedCanvas.width = targetWidth;
    mergedCanvas.height = targetHeight;
    const ctx = mergedCanvas.getContext('2d');
    if (!ctx) return false;

    // 3. Render base background and multi-pane dividers
    const paneWrappers = Array.from(container.querySelectorAll('.chart-pane-wrapper')) as HTMLElement[];
    const isMultiPane = paneWrappers.length > 1;

    if (isMultiPane) {
      // Base layout grid gap divider color (#2a2e39)
      ctx.fillStyle = '#2a2e39';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Fill each chart pane's individual viewport background (#131722)
      for (const p of paneWrappers) {
        const pRect = p.getBoundingClientRect();
        const px = Math.round((pRect.left - containerRect.left) * dpr);
        const py = Math.round((pRect.top - containerRect.top) * dpr);
        const pw = Math.round(pRect.width * dpr);
        const ph = Math.round(pRect.height * dpr);
        ctx.fillStyle = '#131722';
        ctx.fillRect(px, py, pw, ph);
      }
    } else {
      // Single pane solid dark theme background
      ctx.fillStyle = '#131722';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    // 4. Draw each canvas at its exact relative bounding-box position across the entire grid
    for (const c of validCanvases) {
      const cRect = c.getBoundingClientRect();
      const dx = Math.round((cRect.left - containerRect.left) * dpr);
      const dy = Math.round((cRect.top - containerRect.top) * dpr);
      const dw = Math.round(cRect.width * dpr);
      const dh = Math.round(cRect.height * dpr);

      try {
        ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, dw, dh);
      } catch (drawErr) {
        console.warn('[Snapshot] Could not draw canvas layer:', drawErr);
      }
    }

    // 5. Render subtle pro ORDERCRAFT watermark in the bottom-left corner
    try {
      ctx.save();
      const margin = Math.round(16 * dpr);
      const badgeSize = Math.round(18 * dpr);
      const badgeX = margin;
      const badgeY = targetHeight - margin - badgeSize;

      // Draw real logo image
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = '/logo.png';
      await new Promise<void>((resolve) => {
        if (logoImg.complete) return resolve();
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve();
      });

      if (logoImg.width > 0) {
        ctx.save();
        const r = Math.round(4 * dpr);
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(badgeX, badgeY, badgeSize, badgeSize, r);
        } else {
          ctx.rect(badgeX, badgeY, badgeSize, badgeSize);
        }
        ctx.clip();
        ctx.drawImage(logoImg, badgeX, badgeY, badgeSize, badgeSize);
        ctx.restore();
      } else {
        // Fallback badge
        ctx.fillStyle = '#2962ff';
        ctx.beginPath();
        const r = badgeSize / 2;
        ctx.arc(badgeX + r, badgeY + r, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(8 * dpr)}px 'Inter', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OC', badgeX + r, badgeY + r);
      }

      // Watermark text: ORDERCRAFT
      ctx.fillStyle = 'rgba(209, 212, 220, 0.85)';
      ctx.font = `600 ${Math.round(11 * dpr)}px 'Inter', -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('ORDERCRAFT', badgeX + badgeSize + Math.round(7 * dpr), badgeY + badgeSize / 2);

      ctx.restore();
    } catch (wmErr) {
      console.warn('[Snapshot] Watermark render error:', wmErr);
    }

    // 6. Filename formatting with sanitized symbols and clean timestamp
    const cleanSymbol = (symbol || 'CHART').toUpperCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanTf = (timeframe || 'D').replace(/[^a-zA-Z0-9_-]/g, '_');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateFormatted = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    
    const prefix = isMultiPane
      ? `ORDERCRAFT_LAYOUT_${paneWrappers.length}P`
      : `ORDERCRAFT_${cleanSymbol}_${cleanTf}`;
    const filename = `${prefix}_${dateFormatted}.png`;

    if (mode === 'download') {
      try {
        // High-performance direct DataURL download
        // Eliminates asynchronous blob revocation race conditions in Chromium
        const dataUrl = mergedCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } catch (dataUrlErr) {
        console.warn('[Snapshot] toDataURL failed, attempting blob fallback:', dataUrlErr);
        return new Promise<boolean>((resolve) => {
          mergedCanvas.toBlob((blob) => {
            if (!blob) {
              resolve(false);
              return;
            }
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = filename;
            link.href = blobUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => {
              URL.revokeObjectURL(blobUrl);
            }, 60000);
            resolve(true);
          }, 'image/png');
        });
      }
    } else {
      // mode === 'copy': Copy PNG to system clipboard
      return new Promise<boolean>((resolve) => {
        mergedCanvas.toBlob(async (blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          try {
            if (navigator.clipboard && window.ClipboardItem) {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
              ]);
              resolve(true);
            } else {
              console.warn('[Snapshot] ClipboardItem API not supported in this browser context');
              resolve(false);
            }
          } catch (clipErr) {
            console.error('[Snapshot] Failed to write image to clipboard:', clipErr);
            resolve(false);
          }
        }, 'image/png');
      });
    }
  } catch (err) {
    console.error('[Snapshot] Failed to capture snapshot:', err);
    return false;
  }
}
