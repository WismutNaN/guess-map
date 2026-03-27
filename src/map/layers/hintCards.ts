import maplibregl from "maplibre-gl";

/**
 * Hint card renderer — draws compact map-icon cards on a Canvas.
 *
 * Layout v2:
 *  ┌═══════════════════════════════╗
 *  ║  TAG TEXT                      ║  ← accent header strip (no overlay)
 *  ╠═══════════════════════════════╣
 *  ║                               ║
 *  ║        [IMAGE / TEXT]         ║  ← clean content area
 *  ║                               ║
 *  ╠═══════════════════════════════╣  (only when subtitle present)
 *  ║  caption                      ║  ← subtitle strip below image
 *  ╚═══════════════════════════════╝
 *
 * Key improvements over v1:
 *  - Tag is a full-width header strip, never overlaps image
 *  - Subtitle is below the image, never overlaps it
 *  - Text cards auto-size font to fill available space
 *  - Thin border (3px) to maximise content area
 */

// ---------------------------------------------------------------------------
// Card dimensions
// ---------------------------------------------------------------------------

const CARD_W = 240;
const CARD_H = 180;

const BORDER = 3;
const BORDER_RADIUS = 8;

// Header strip (top, full-width accent bar with tag text)
const HEADER_H = 24;
const HEADER_FONT_SIZE = 16;
const HEADER_PAD_LEFT = 8;

// Content area (image or auto-sized text)
const CONTENT_Y = BORDER + HEADER_H; // 27
const CONTENT_W = CARD_W - BORDER * 2; // 234
const CONTENT_H_FULL = CARD_H - BORDER - CONTENT_Y; // 150 (no subtitle)

// Subtitle strip
const SUB_H = 22;
const SUB_FONT_SIZE = 13;
const CONTENT_H_WITH_SUB = CONTENT_H_FULL - SUB_H; // 128

// ---------------------------------------------------------------------------
// Accent colours per hint code
// ---------------------------------------------------------------------------

const HINT_COLORS: Record<string, string> = {
  flag: "#1f6feb",
  script_sample: "#5b8def",
  road_marking: "#16a34a",
  sign: "#f59e0b",
  pole: "#a855f7",
  bollard: "#ef4444",
  phone_hint: "#0ea5e9",
  country_domain: "#0284c7",
  camera_meta: "#2563eb",
  camera_gen1: "#ef4444",
  camera_gen2: "#f97316",
  camera_gen3: "#eab308",
  camera_gen4: "#22c55e",
  camera_low_cam: "#0ea5e9",
  camera_shit_cam: "#9333ea",
  camera_small_cam: "#14b8a6",
  camera_trekker_gen2: "#6366f1",
  camera_trekker_gen3: "#8b5cf6",
  camera_trekker_gen4: "#ec4899",
  camera_gens_tag: "#0f766e",
  snow_outdoor: "#cc3333",
  snow_indoor: "#4393c3",
  vegetation: "#22c55e",
  note: "#475569",
};

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface HintImageCardOptions {
  hintCode: string;
  tag: string;
  subtitle?: string | null;
  width?: number;
  height?: number;
}

export interface HintTextCardOptions {
  hintCode: string;
  tag: string;
  text: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function norm(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function hashStr(v: string): number {
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fallbackColor(code: string): string {
  return `hsl(${hashStr(code) % 360} 72% 46%)`;
}

export function colorForHintCode(code: string): string {
  return HINT_COLORS[code] ?? fallbackColor(code);
}

function trunc(v: string, max: number): string {
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Canvas primitives
// ---------------------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function makeCanvas(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

// ---------------------------------------------------------------------------
// Card frame: white fill + thin accent border
// ---------------------------------------------------------------------------

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent: string,
) {
  roundRect(ctx, 0, 0, w, h, BORDER_RADIUS);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  const half = BORDER / 2;
  roundRect(ctx, half, half, w - BORDER, h - BORDER, BORDER_RADIUS - 1);
  ctx.lineWidth = BORDER;
  ctx.strokeStyle = accent;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Accent header strip — full-width bar at top with tag text
// ---------------------------------------------------------------------------

function drawHeader(
  ctx: CanvasRenderingContext2D,
  tag: string,
  accent: string,
  w: number,
) {
  const label = trunc(tag.toUpperCase(), 24);
  const x = BORDER;
  const y = BORDER;
  const stripW = w - BORDER * 2;

  // Accent background (inside border, top corners rounded)
  ctx.save();
  roundRect(ctx, x, y, stripW, HEADER_H, BORDER_RADIUS - 2);
  // Clip off bottom rounding by extending the rect
  ctx.rect(x, y + HEADER_H / 2, stripW, HEADER_H / 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  // Actually just draw a clean rect with top rounding
  ctx.save();
  ctx.beginPath();
  const r = BORDER_RADIUS - 2;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + stripW - r, y);
  ctx.quadraticCurveTo(x + stripW, y, x + stripW, y + r);
  ctx.lineTo(x + stripW, y + HEADER_H);
  ctx.lineTo(x, y + HEADER_H);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  // White text
  ctx.save();
  ctx.font = `700 ${HEADER_FONT_SIZE}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    label,
    x + HEADER_PAD_LEFT,
    y + HEADER_H / 2 + 0.5,
    stripW - HEADER_PAD_LEFT * 2,
  );
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Subtitle strip — narrow bar at bottom, BELOW content area
// ---------------------------------------------------------------------------

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
) {
  const label = trunc(text, 30);
  const stripX = BORDER + 2;
  const stripW = w - (BORDER + 2) * 2;
  const stripY = h - BORDER - SUB_H;

  ctx.save();
  roundRect(ctx, stripX, stripY, stripW, SUB_H, 4);
  ctx.fillStyle = "#f0f3f8";
  ctx.fill();

  ctx.font = `600 ${SUB_FONT_SIZE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1b2439";
  ctx.fillText(label, w / 2, stripY + SUB_H / 2 + 0.5, stripW - 12);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fitted image — centres and scales to fit an area (contain mode)
// ---------------------------------------------------------------------------

function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  src: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const nw = src.naturalWidth || src.width;
  const nh = src.naturalHeight || src.height;
  if (nw <= 0 || nh <= 0) return;

  const scale = Math.min(w / nw, h / nh);
  const dw = Math.max(1, Math.round(nw * scale));
  const dh = Math.max(1, Math.round(nh * scale));
  const dx = Math.round(x + (w - dw) / 2);
  const dy = Math.round(y + (h - dh) / 2);
  ctx.drawImage(src, dx, dy, dw, dh);
}

// ---------------------------------------------------------------------------
// Word-wrap
// ---------------------------------------------------------------------------

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const c = `${cur} ${words[i]}`;
    if (ctx.measureText(c).width <= maxWidth) {
      cur = c;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) return lines.slice(0, maxLines);

  if (
    lines.length === maxLines &&
    words.join(" ").length > lines.join(" ").length
  ) {
    lines[maxLines - 1] = trunc(
      lines[maxLines - 1],
      Math.max(8, lines[maxLines - 1].length - 1),
    );
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Auto-fit text: choose the largest font that fits
// ---------------------------------------------------------------------------

interface FitResult {
  fontSize: number;
  lines: string[];
  lineHeight: number;
}

const FONT_SIZES = [80, 64, 52, 44, 36, 30, 26, 22, 20];

function autoFitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxH: number,
): FitResult {
  const cleaned = text.trim();
  for (const size of FONT_SIZES) {
    const lineH = Math.ceil(size * 1.25);
    const maxLines = Math.max(1, Math.floor(maxH / lineH));
    ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
    const lines = wrapLines(ctx, cleaned, maxW, maxLines);
    const totalH = lines.length * lineH;
    // Check all text is rendered (>= 85% of original chars)
    const rendered = lines.join(" ").replace(/…$/, "").length;
    if (totalH <= maxH && rendered >= cleaned.length * 0.85) {
      return { fontSize: size, lines, lineHeight: lineH };
    }
  }
  // Fallback
  ctx.font = `700 20px "Segoe UI", system-ui, sans-serif`;
  return {
    fontSize: 20,
    lines: wrapLines(ctx, cleaned, maxW, Math.floor(maxH / 25)),
    lineHeight: 25,
  };
}

// ---------------------------------------------------------------------------
// Public: createHintImageCard
// ---------------------------------------------------------------------------

export function createHintImageCard(
  source: HTMLImageElement,
  options: HintImageCardOptions,
): ImageData | HTMLImageElement {
  const w = options.width ?? CARD_W;
  const h = options.height ?? CARD_H;
  const accent = colorForHintCode(options.hintCode);
  const subtitle = norm(options.subtitle);

  const result = makeCanvas(w, h);
  if (!result) return source;
  const { canvas, ctx } = result;

  // 1. Frame
  drawFrame(ctx, w, h, accent);

  // 2. Header strip
  drawHeader(ctx, options.tag, accent, w);

  // 3. Image content — clean area below header
  const imgX = BORDER + 1;
  const imgY = CONTENT_Y;
  const imgW = CONTENT_W - 2;
  const imgH = subtitle ? CONTENT_H_WITH_SUB : CONTENT_H_FULL;

  ctx.save();
  roundRect(ctx, imgX, imgY, imgW, imgH, 3);
  ctx.fillStyle = "#f0f3f8";
  ctx.fill();
  ctx.clip();
  drawFittedImage(ctx, source, imgX, imgY, imgW, imgH);
  ctx.restore();

  // 4. Subtitle (below image)
  if (subtitle) {
    drawSubtitle(ctx, subtitle, w, h);
  }

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
// Public: createHintTextCard
// ---------------------------------------------------------------------------

export function createHintTextCard(
  options: HintTextCardOptions,
): ImageData | HTMLImageElement {
  const w = options.width ?? CARD_W;
  const h = options.height ?? CARD_H;
  const accent = colorForHintCode(options.hintCode);

  const result = makeCanvas(w, h);
  if (!result) return new Image();
  const { canvas, ctx } = result;

  // 1. Frame
  drawFrame(ctx, w, h, accent);

  // 2. Header strip
  drawHeader(ctx, options.tag, accent, w);

  // 3. Text content area — light background
  const areaX = BORDER + 4;
  const areaY = CONTENT_Y + 2;
  const areaW = CONTENT_W - 8;
  const areaH = CONTENT_H_FULL - 4;

  roundRect(ctx, areaX, areaY, areaW, areaH, 5);
  ctx.fillStyle = "#f4f6fb";
  ctx.fill();

  // 4. Auto-sized text
  const text = norm(options.text) ?? "";
  const padX = 10;
  const padY = 6;
  const fit = autoFitText(
    ctx,
    text,
    areaW - padX * 2,
    areaH - padY * 2,
  );

  ctx.save();
  ctx.fillStyle = "#1b2439";
  ctx.font = `700 ${fit.fontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const totalH = fit.lines.length * fit.lineHeight;
  let curY =
    areaY + areaH / 2 - totalH / 2 + fit.lineHeight / 2;
  for (const line of fit.lines) {
    ctx.fillText(line, w / 2, curY, areaW - padX * 2);
    curY += fit.lineHeight;
  }
  ctx.restore();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
// Map image helpers
// ---------------------------------------------------------------------------

export type HintCardImage =
  | ImageData
  | HTMLImageElement
  | ImageBitmap
  | { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

export function isValidHintCardImage(
  image: HintCardImage,
): image is HintCardImage {
  if (!image) return false;
  const w = (image as { width?: unknown }).width;
  const h = (image as { height?: unknown }).height;
  return (
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    Number(w) > 0 &&
    Number(h) > 0
  );
}

export function setHintCardImage(
  map: maplibregl.Map,
  imageId: string,
  image: HintCardImage,
) {
  if (!isValidHintCardImage(image)) return;
  if (map.hasImage(imageId)) return;
  map.addImage(imageId, image as Parameters<maplibregl.Map["addImage"]>[1]);
}
