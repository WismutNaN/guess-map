import maplibregl from "maplibre-gl";

/**
 * Hint card renderer — draws compact map-icon cards on a Canvas.
 *
 * Design goals:
 *  - Thick accent-coloured border for clear visual grouping
 *  - Small tag badge (hint-type name) overlaid at top-left
 *  - Image fills nearly the entire card interior
 *  - Readable at typical map zoom levels (cards render 50-120 px on screen)
 */

// ---------------------------------------------------------------------------
// Card dimensions
// ---------------------------------------------------------------------------

const DEFAULT_CARD_WIDTH = 240;
const DEFAULT_CARD_HEIGHT = 180;

// Border
const BORDER_WIDTH = 5;
const BORDER_RADIUS = 10;

// Tag badge (top-left overlay)
const TAG_FONT_SIZE = 15;
const TAG_LINE_HEIGHT = 24;
const TAG_PAD_H = 8;
const TAG_RADIUS = 6;
const TAG_INSET = 8; // from inner edge of border

// Content area
const CONTENT_PAD = 4; // between border and image

// Text card
const TEXT_FONT_SIZE = 20;
const TEXT_LINE_HEIGHT = 26;
const TEXT_MAX_LINES = 4;

// Subtitle strip (bottom)
const SUBTITLE_HEIGHT = 22;
const SUBTITLE_FONT_SIZE = 13;

// ---------------------------------------------------------------------------
// Accent colours per hint code
// ---------------------------------------------------------------------------

const KNOWN_HINT_COLORS: Record<string, string> = {
  flag: "#1f6feb",
  script_sample: "#5b8def",
  road_marking: "#16a34a",
  sign: "#f59e0b",
  pole: "#a855f7",
  bollard: "#ef4444",
  phone_hint: "#0ea5e9",
  camera_meta: "#2563eb",
  camera_generation: "#6366f1",
  car_type: "#14b8a6",
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

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackColorForCode(code: string): string {
  const hue = hashString(code) % 360;
  return `hsl(${hue} 72% 46%)`;
}

export function colorForHintCode(code: string): string {
  return KNOWN_HINT_COLORS[code] ?? fallbackColorForCode(code);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Canvas primitives
// ---------------------------------------------------------------------------

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { canvas, ctx };
}

// ---------------------------------------------------------------------------
// Card frame — white background + thick accent border
// ---------------------------------------------------------------------------

function drawCardFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accentColor: string,
) {
  // White fill
  roundedRectPath(ctx, 0, 0, width, height, BORDER_RADIUS);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Thick accent stroke
  const half = BORDER_WIDTH / 2;
  roundedRectPath(
    ctx,
    half,
    half,
    width - BORDER_WIDTH,
    height - BORDER_WIDTH,
    BORDER_RADIUS - 1,
  );
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeStyle = accentColor;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Tag badge — small accent-coloured pill at top-left
// ---------------------------------------------------------------------------

function drawTagBadge(
  ctx: CanvasRenderingContext2D,
  tag: string,
  accentColor: string,
  cardWidth: number,
) {
  const label = truncateText(tag.toUpperCase(), 22);
  ctx.save();
  ctx.font = `700 ${TAG_FONT_SIZE}px "Segoe UI", system-ui, sans-serif`;
  const maxBadgeWidth = cardWidth - (TAG_INSET + BORDER_WIDTH) * 2;
  const textWidth = Math.min(ctx.measureText(label).width, maxBadgeWidth - TAG_PAD_H * 2);
  const badgeW = textWidth + TAG_PAD_H * 2;
  const badgeX = BORDER_WIDTH + TAG_INSET;
  const badgeY = BORDER_WIDTH + TAG_INSET;

  // Semi-transparent accent pill
  roundedRectPath(ctx, badgeX, badgeY, badgeW, TAG_LINE_HEIGHT, TAG_RADIUS);
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.88;
  ctx.fill();
  ctx.globalAlpha = 1;

  // White label
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, badgeX + TAG_PAD_H, badgeY + TAG_LINE_HEIGHT / 2 + 0.5, textWidth);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Subtitle strip — narrow bar at the bottom of the card
// ---------------------------------------------------------------------------

function drawSubtitleStrip(
  ctx: CanvasRenderingContext2D,
  subtitle: string,
  width: number,
  height: number,
) {
  const label = truncateText(subtitle, 30);
  const stripY = height - BORDER_WIDTH - SUBTITLE_HEIGHT - 2;
  const stripX = BORDER_WIDTH + 4;
  const stripW = width - (BORDER_WIDTH + 4) * 2;

  ctx.save();
  // Semi-transparent background
  roundedRectPath(ctx, stripX, stripY, stripW, SUBTITLE_HEIGHT, 5);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fill();

  // Text
  ctx.font = `600 ${SUBTITLE_FONT_SIZE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1b2439";
  ctx.fillText(label, width / 2, stripY + SUBTITLE_HEIGHT / 2 + 0.5, stripW - 12);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fitted image — centres and scales to fill an area
// ---------------------------------------------------------------------------

function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const nw = source.naturalWidth || source.width;
  const nh = source.naturalHeight || source.height;
  if (nw <= 0 || nh <= 0) return;

  const scale = Math.min(w / nw, h / nh);
  const dw = Math.max(1, Math.round(nw * scale));
  const dh = Math.max(1, Math.round(nh * scale));
  const dx = Math.round(x + (w - dw) / 2);
  const dy = Math.round(y + (h - dh) / 2);
  ctx.drawImage(source, dx, dy, dw, dh);
}

// ---------------------------------------------------------------------------
// Word-wrap helper
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
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) return lines.slice(0, maxLines);

  if (
    lines.length === maxLines &&
    words.join(" ").length > lines.join(" ").length
  ) {
    lines[maxLines - 1] = truncateText(
      lines[maxLines - 1],
      Math.max(8, lines[maxLines - 1].length - 1),
    );
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Public: createHintImageCard
// ---------------------------------------------------------------------------

export function createHintImageCard(
  source: HTMLImageElement,
  options: HintImageCardOptions,
): ImageData | HTMLImageElement {
  const width = options.width ?? DEFAULT_CARD_WIDTH;
  const height = options.height ?? DEFAULT_CARD_HEIGHT;
  const accentColor = colorForHintCode(options.hintCode);
  const subtitle = normalizeText(options.subtitle);

  const result = createCanvas(width, height);
  if (!result) return source;
  const { canvas, ctx } = result;

  // 1. Card frame (white bg + accent border)
  drawCardFrame(ctx, width, height, accentColor);

  // 2. Image — fills interior, clipped to inner rounded rect
  const inset = BORDER_WIDTH + CONTENT_PAD;
  const imgX = inset;
  const imgY = inset;
  const imgW = width - inset * 2;
  const imgH = height - inset * 2;

  ctx.save();
  roundedRectPath(ctx, imgX, imgY, imgW, imgH, 4);
  ctx.fillStyle = "#f0f3f8";
  ctx.fill();
  ctx.clip();
  drawFittedImage(ctx, source, imgX, imgY, imgW, imgH);
  ctx.restore();

  // 3. Tag badge (on top of image)
  drawTagBadge(ctx, options.tag, accentColor, width);

  // 4. Subtitle strip at bottom (if present)
  if (subtitle) {
    drawSubtitleStrip(ctx, subtitle, width, height);
  }

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
// Public: createHintTextCard
// ---------------------------------------------------------------------------

export function createHintTextCard(
  options: HintTextCardOptions,
): ImageData | HTMLImageElement {
  const width = options.width ?? DEFAULT_CARD_WIDTH;
  const height = options.height ?? DEFAULT_CARD_HEIGHT;
  const accentColor = colorForHintCode(options.hintCode);

  const result = createCanvas(width, height);
  if (!result) return new Image();
  const { canvas, ctx } = result;

  // 1. Card frame
  drawCardFrame(ctx, width, height, accentColor);

  // 2. Tag badge
  drawTagBadge(ctx, options.tag, accentColor, width);

  // 3. Centred text in the content area
  const textInset = BORDER_WIDTH + 12;
  const textAreaX = textInset;
  const textAreaY = BORDER_WIDTH + TAG_INSET + TAG_LINE_HEIGHT + 6;
  const textAreaW = width - textInset * 2;
  const textAreaH = height - textAreaY - BORDER_WIDTH - 8;

  // Light background
  roundedRectPath(ctx, textAreaX, textAreaY, textAreaW, textAreaH, 6);
  ctx.fillStyle = "#f4f6fb";
  ctx.fill();

  // Text content
  ctx.save();
  ctx.fillStyle = "#1b2439";
  ctx.font = `700 ${TEXT_FONT_SIZE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const text = normalizeText(options.text) ?? "";
  const lines = wrapLines(ctx, text, textAreaW - 16, TEXT_MAX_LINES);
  const totalH = lines.length * TEXT_LINE_HEIGHT;
  let curY = textAreaY + textAreaH / 2 - totalH / 2 + TEXT_LINE_HEIGHT / 2;
  for (const line of lines) {
    ctx.fillText(line, width / 2, curY, textAreaW - 16);
    curY += TEXT_LINE_HEIGHT;
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
    Number.isFinite(w) && Number.isFinite(h) && Number(w) > 0 && Number(h) > 0
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
