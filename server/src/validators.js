export function nowIso() {
  return new Date().toISOString();
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function slugifyTag(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeLang(value, fallback = 'en') {
  const raw = String(value || fallback).trim().toLowerCase();
  if (raw === 'ko' || raw === 'kr') return 'ko';
  return 'en';
}

export function normalizeSection(value, fallback = 'blog') {
  const raw = String(value || fallback).trim().toLowerCase();
  if (raw === 'blog') return 'blog';
  if (raw === 'tool' || raw === 'tools') return 'tools';
  if (raw === 'game' || raw === 'games') return 'games';
  if (raw === 'page' || raw === 'pages') return 'pages';
  return fallback;
}

export function normalizeStatus(value, fallback = 'draft') {
  const raw = String(value || fallback).trim().toLowerCase();
  return raw === 'published' ? 'published' : 'draft';
}

export function parseIntSafe(value, fallback = null) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function dedupeTags(tags) {
  const list = Array.isArray(tags)
    ? tags
    : String(tags || '')
        .split(',')
        .map((item) => item.trim());

  const map = new Map();
  for (const tag of list) {
    const clean = String(tag || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!map.has(key)) map.set(key, clean);
  }

  return [...map.values()];
}

export function clamp(input, min, max) {
  return Math.max(min, Math.min(max, input));
}

export function toPlainText(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|blockquote|section|article)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function toExcerpt(value, maxLength = 180) {
  const clean = toPlainText(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3)}...`;
}

export function parseDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function parseCardRank(value) {
  if (value === null || value === undefined || value === '') return null;
  const asString = String(value).trim();
  const match = asString.match(/\d+/);
  if (!match) return null;
  const n = Number.parseInt(match[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function jsonOk(res, data, status = 200, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.status(status).json(data);
}

export function jsonError(res, status, message, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.status(status).json({ ok: false, error: message });
}
