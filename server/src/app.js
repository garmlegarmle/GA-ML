import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import multer from 'multer';
import { getConfig } from './config.js';
import {
  clamp,
  jsonError,
  jsonOk,
  normalizeLang,
  normalizeSection,
  nowIso,
  parseIntSafe,
  slugify
} from './validators.js';
import {
  SESSION_COOKIE,
  createSignedValue,
  getAdminSession,
  hashPassword,
  isAdminRequest,
  isAllowedAdmin,
  makeClearCookie,
  makeSetCookie,
  verifyPasswordHash
} from './auth.js';
import {
  createPool,
  ensureSeedProgramPosts,
  ensureSchema,
  ensureSeedPages,
  getAppSetting,
  registerGamePlay,
  getMediaById,
  getMediaVariants,
  getGamePlaySummary,
  listGameLeaderboard,
  mapPostRow,
  recordGameLeaderboardEntryForRun,
  setAppSetting,
  softDeletePost,
  touchViewCount
} from './db.js';
import {
  buildMediaUrls,
  buildStorageKey,
  detectMediaKind,
  extensionFromMime,
  resolveStoragePath,
  saveBufferToKey,
  variantMimeType,
  writeImageVariants
} from './media.js';
import { createHoldemOnlineManager } from './holdem-online/manager.js';
import { createMineCartDuelOnlineManager } from './mine-cart-duel-online/manager.js';
import { ensureMarketDataReady } from './market-data.js';
import { canAssignMenu, createSiteMenusRouter, ensureSiteMenus, numericId, withMenuWrite } from './site-menus.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });
const execFileAsync = promisify(execFile);
const config = getConfig();
const pool = createPool(config);
const publicBaseUrl = config.mediaPublicBaseUrl || config.siteOrigin || '';
const SITEMAP_LANGS = ['en', 'ko'];
const SITEMAP_SECTIONS = ['tools', 'games', 'blog'];
const VIEW_COUNT_EXCLUDED_PAGE_SLUGS = new Set(['about', 'contact', 'privacy-policy']);
const CHART_INTERPRETATION_TOOL_SLUG = 'chart-interpretation';
const MARKET_DATA_REQUIRED_ROWS = 260;
const HOLDEM_GAME_SLUG = 'texas-holdem-tournament';
const MAX_HOLDEM_PLAYER_NAME_LENGTH = 24;
const HOLDEM_MAX_PLAYERS = 9;
const HOLDEM_HANDS_PER_LEVEL = 8;
const HOLDEM_RUN_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const rateLimitStore = new Map();
const holdemOnlineManager = createHoldemOnlineManager();
const mineCartDuelOnlineManager = createMineCartDuelOnlineManager();

function withSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function resolvePublicOrigin(req) {
  if (config.siteOrigin) {
    return String(config.siteOrigin).replace(/\/+$/, '');
  }

  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');
  return `${protocol}://${host}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatSitemapDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function trackLatest(map, key, dateValue) {
  if (!dateValue) return;
  const previous = map.get(key);
  if (!previous || previous < dateValue) {
    map.set(key, dateValue);
  }
}

function shouldTrackViewCount(row) {
  return !(
    row.section === 'pages' &&
    VIEW_COUNT_EXCLUDED_PAGE_SLUGS.has(String(row.slug || '').trim().toLowerCase())
  );
}

function hasEmbeddedProgram(section, slug) {
  return (
    (section === 'tools' && (slug === 'trend-analyzer' || slug === CHART_INTERPRETATION_TOOL_SLUG)) ||
    (section === 'games' && (slug === 'texas-holdem-tournament' || slug === 'mine-cart-duel'))
  );
}

function normalizeBodyLayoutJson(value) {
  if (value?.version !== 1 || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 100 ||
      !Array.isArray(value.elements) || value.elements.length > 1500) return null;
  const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 100;
  if (value.pages.some((page) => !validId(page?.id))) return null;
  const pages = new Set(value.pages.map((page) => page.id));
  const ids = new Set();
  if (pages.size !== value.pages.length) return null;
  for (const item of value.elements) {
    if (!validId(item?.id) || ids.has(item.id) || !pages.has(item.pageId) ||
        !['text', 'table', 'image', 'shape'].includes(item.type) ||
        ![item.x, item.y, item.width, item.height, item.zIndex].every(Number.isFinite)) return null;
    if (item.type === 'text' && (typeof item.html !== 'string' || !item.style || typeof item.style !== 'object')) return null;
    if (item.type === 'table' && (!item.style || typeof item.style !== 'object' || !Array.isArray(item.rows) ||
        item.rows.some((row) => !Array.isArray(row) || row.some((cell) => typeof cell?.html !== 'string')))) return null;
    ids.add(item.id);
  }
  return value;
}

function renderSitemapXml(entries) {
  const body = entries
    .map((entry) => {
      const lines = ['  <url>', `    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) {
        lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
      }
      lines.push('  </url>');
      return lines.join('\n');
    })
    .join('\n');

  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', body, '</urlset>'].join('\n');
}

function requireAdmin(req, res) {
  if (!isAdminRequest(req, config)) {
    jsonError(res, 401, 'Admin authentication required');
    return false;
  }
  return true;
}

function cacheHeadersForList(isAdmin, statusFilter, hasSearch) {
  if (isAdmin || statusFilter === 'all' || statusFilter === 'draft') {
    return { 'Cache-Control': 'no-store' };
  }
  if (hasSearch) {
    return { 'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=120' };
  }
  return { 'Cache-Control': 'public, max-age=45, s-maxage=240, stale-while-revalidate=480' };
}

function normalizeTrendTicker(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '');
}

function normalizeChartArtifactSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]/gi, '');
}

function createChartInterpretationRunId() {
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function chartInterpretationRunsRoot() {
  return path.join(config.chartInterpretationWorkspaceRoot, 'runs');
}

function chartInterpretationCacheRoot() {
  return path.join(config.chartInterpretationWorkspaceRoot, 'cache');
}

function chartInterpretationArtifactUrl(runId, filePath) {
  const safeRunId = normalizeChartArtifactSegment(runId);
  const fileName = normalizeChartArtifactSegment(path.basename(String(filePath || '')));
  if (!safeRunId || !fileName) return '';
  return `/api/tools/chart-interpretation/artifacts/${encodeURIComponent(safeRunId)}/${encodeURIComponent(fileName)}`;
}

function validateChartInterpretationResult(payload, stderr = '') {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !payload.analysis ||
    typeof payload.analysis !== 'object' ||
    !payload.artifacts ||
    typeof payload.artifacts !== 'object'
  ) {
    throw new Error(String(stderr || '').trim() || 'Chart interpretation returned an invalid payload');
  }
}

function validateTrendAnalysisPayload(payload, stderr = '') {
  if (!payload?.meta || !payload?.current_state || !Array.isArray(payload?.chart_200d?.candles)) {
    const detail = String(stderr || '').trim();
    throw new Error(detail || 'Trend analyzer returned an invalid payload');
  }
}

function chartInterpretationTickerMissingDataMessage(ticker) {
  const safeTicker = normalizeTrendTicker(ticker) || 'the requested ticker';
  return `No stored daily market data is available for ${safeTicker} yet. Ticker mode now reads from the GA-ML PostgreSQL market database, not a live external API. Run the GitHub Actions market-data sync first, or upload a CSV instead.`;
}

function isMissingStoredTickerDataError(detail) {
  const text = String(detail || '').trim();
  if (!text) return false;
  return /\bhas only \d+ stored rows\b/i.test(text) || /stored rows in (us|kr)_equity_daily/i.test(text);
}

function normalizeHoldemPlayerName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_HOLDEM_PLAYER_NAME_LENGTH);
}

function createRunToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function getRateLimitKey(req, namespace) {
  const forwardedFor = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
  return `${namespace}:${ip}`;
}

function rateLimit({ namespace, max, windowMs }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = getRateLimitKey(req, namespace);
    const existing = rateLimitStore.get(key);
    const bucket =
      existing && existing.resetAt > now
        ? existing
        : {
            count: 0,
            resetAt: now + windowMs
          };

    bucket.count += 1;
    rateLimitStore.set(key, bucket);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(max - bucket.count, 0)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)));
      return jsonError(res, 429, 'Too many requests. Please try again shortly.');
    }

    if (rateLimitStore.size > 5000) {
      for (const [entryKey, entry] of rateLimitStore.entries()) {
        if (entry.resetAt <= now) {
          rateLimitStore.delete(entryKey);
        }
      }
    }

    return next();
  };
}

async function buildHoldemGameStats(playerName = '') {
  const normalizedName = normalizeHoldemPlayerName(playerName);
  const [summary, leaderboard] = await Promise.all([
    getGamePlaySummary(pool, {
      gameSlug: HOLDEM_GAME_SLUG,
      playerName: normalizedName || null
    }),
    listGameLeaderboard(pool, { gameSlug: HOLDEM_GAME_SLUG })
  ]);

  return {
    summary,
    leaderboard,
    playerName: normalizedName || null
  };
}

function isCsvUpload(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const originalName = String(file?.originalname || '').toLowerCase();
  return (
    mimeType === 'text/csv' ||
    mimeType === 'application/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/plain' ||
    originalName.endsWith('.csv')
  );
}

async function analyzeTrendCsvUpload(file, ticker) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ga-ml-trend-upload-'));
  const originalName = String(file.originalname || 'upload.csv').replace(/[^a-z0-9._-]/gi, '_');
  const tempCsvPath = path.join(tempDir, originalName.endsWith('.csv') ? originalName : `${originalName}.csv`);

  try {
    await fs.writeFile(tempCsvPath, file.buffer);
    const args = [
      config.trendAnalyzerScript,
      tempCsvPath,
      '--date-column',
      'date',
      '--window-bars',
      '200'
    ];

    if (config.trendAnalyzerBestParamsCsv) {
      args.push('--best-params-csv', config.trendAnalyzerBestParamsCsv);
    } else {
      args.push('--use-default-config');
    }
    if (ticker) {
      args.push('--ticker', ticker);
    }

    const { stdout, stderr } = await execFileAsync(config.trendAnalyzerPythonBin, args, {
      timeout: config.trendAnalyzerTimeoutMs,
      maxBuffer: 4 * 1024 * 1024
    });

    const payload = JSON.parse(String(stdout || '').trim() || '{}');
    validateTrendAnalysisPayload(payload, stderr);
    return payload;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function analyzeTrendTicker(ticker) {
  await ensureMarketDataReady(pool, config, {
    ticker,
    requiredRows: MARKET_DATA_REQUIRED_ROWS,
    retainRows: config.marketDataRetainRows
  });

  const args = [config.trendAnalyzerTickerScript, ticker, '--rows', String(MARKET_DATA_REQUIRED_ROWS), '--window-bars', '200'];
  if (config.trendAnalyzerBestParamsCsv) {
    args.push('--best-params-csv', config.trendAnalyzerBestParamsCsv);
  } else {
    args.push('--use-default-config');
  }

  const { stdout, stderr } = await execFileAsync(config.trendAnalyzerPythonBin, args, {
    timeout: config.trendAnalyzerTimeoutMs + config.marketDataGithubTimeoutMs,
    maxBuffer: 6 * 1024 * 1024
  });

  const payload = JSON.parse(String(stdout || '').trim() || '{}');
  validateTrendAnalysisPayload(payload, stderr);
  return payload;
}

async function analyzeChartInterpretationTicker(ticker) {
  const runId = createChartInterpretationRunId();
  const runDir = path.join(chartInterpretationRunsRoot(), runId);
  await fs.mkdir(runDir, { recursive: true });

  try {
    await ensureMarketDataReady(pool, config, {
      ticker,
      requiredRows: MARKET_DATA_REQUIRED_ROWS,
      retainRows: config.marketDataRetainRows
    });

    const { stdout, stderr } = await execFileAsync(
      config.chartInterpretationPythonBin,
      [
        config.chartInterpretationScript,
        'ticker',
        ticker,
        '--rows',
        String(MARKET_DATA_REQUIRED_ROWS),
        '--output-dir',
        runDir
      ],
      {
        timeout: config.chartInterpretationTimeoutMs,
        maxBuffer: 8 * 1024 * 1024
      }
    );

    const payload = JSON.parse(String(stdout || '').trim() || '{}');
    validateChartInterpretationResult(payload, stderr);

    return {
      ok: true,
      mode: 'ticker',
      label: String(payload.label || ticker).trim() || ticker,
      artifacts: {
        analysis_json: chartInterpretationArtifactUrl(runId, payload.artifacts.analysis_json),
        chart_png: chartInterpretationArtifactUrl(runId, payload.artifacts.chart_png),
        report_html: chartInterpretationArtifactUrl(runId, payload.artifacts.report_html)
      },
      analysis: payload.analysis
    };
  } catch (error) {
    const detail = [
      error instanceof Error ? error.message : '',
      String(error?.stderr || '').trim(),
      String(error?.stdout || '').trim()
    ]
      .filter(Boolean)
      .join('\n');
    if (isMissingStoredTickerDataError(detail)) {
      const wrapped = new Error(chartInterpretationTickerMissingDataMessage(ticker));
      wrapped.statusCode = 503;
      throw wrapped;
    }
    throw error;
  }
}

async function analyzeChartInterpretationCsvUpload(file, title = '') {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ga-ml-chart-interpretation-upload-'));
  const originalName = String(file.originalname || 'upload.csv').replace(/[^a-z0-9._-]/gi, '_');
  const tempCsvPath = path.join(tempDir, originalName.endsWith('.csv') ? originalName : `${originalName}.csv`);
  const runId = createChartInterpretationRunId();
  const runDir = path.join(chartInterpretationRunsRoot(), runId);
  const fallbackTitle = path.parse(originalName).name || 'uploaded_csv';
  const safeTitle = String(title || fallbackTitle)
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);

  try {
    await fs.writeFile(tempCsvPath, file.buffer);
    await fs.mkdir(runDir, { recursive: true });

    const { stdout, stderr } = await execFileAsync(
      config.chartInterpretationPythonBin,
      [config.chartInterpretationScript, 'csv', tempCsvPath, '--output-dir', runDir, '--title', safeTitle || fallbackTitle],
      {
        timeout: config.chartInterpretationTimeoutMs,
        maxBuffer: 8 * 1024 * 1024
      }
    );

    const payload = JSON.parse(String(stdout || '').trim() || '{}');
    validateChartInterpretationResult(payload, stderr);

    return {
      ok: true,
      mode: 'csv',
      label: String(payload.label || safeTitle || fallbackTitle).trim() || fallbackTitle,
      artifacts: {
        analysis_json: chartInterpretationArtifactUrl(runId, payload.artifacts.analysis_json),
        chart_png: chartInterpretationArtifactUrl(runId, payload.artifacts.chart_png),
        report_html: chartInterpretationArtifactUrl(runId, payload.artifacts.report_html)
      },
      analysis: payload.analysis
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function bootstrap() {
  await fs.mkdir(config.mediaRoot, { recursive: true });
  await fs.mkdir(config.chartInterpretationWorkspaceRoot, { recursive: true });
  await fs.mkdir(chartInterpretationRunsRoot(), { recursive: true });
  await fs.mkdir(chartInterpretationCacheRoot(), { recursive: true });
  await ensureSchema(pool);
  await ensureSeedPages(pool);
  await ensureSeedProgramPosts(pool);
  await ensureSiteMenus(pool);
  const currentHash = await getAppSetting(pool, 'admin_password_hash');
  if (!currentHash && config.adminLoginPassword) {
    await setAppSetting(pool, 'admin_password_hash', hashPassword(config.adminLoginPassword));
  }
}

const app = express();
app.set('trust proxy', true);
app.use((req, res, next) => {
  withSecurityHeaders(res);
  next();
});
app.use(express.json({ limit: '2mb' }));

app.use('/api/menus', createSiteMenusRouter(pool, requireAdmin, (req) => isAdminRequest(req, config)));

app.get('/health', (_req, res) => {
  jsonOk(res, { ok: true, service: 'utility-box-api' });
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const origin = resolvePublicOrigin(req);
    const result = await pool.query(
      `SELECT lang, section, slug, COALESCE(updated_at, published_at, created_at) AS lastmod
       FROM posts
       WHERE is_deleted = FALSE
         AND status = 'published'
       ORDER BY lang ASC, section ASC, COALESCE(updated_at, published_at, created_at) DESC, id DESC`
    );

    const latestByLang = new Map();
    const latestBySection = new Map();
    const postEntries = [];

    for (const row of result.rows) {
      const lang = String(row.lang || '').trim().toLowerCase();
      const section = String(row.section || '').trim().toLowerCase();
      const slug = String(row.slug || '').trim();
      if (!lang || !section || !slug) continue;

      const lastmod = formatSitemapDate(row.lastmod);
      trackLatest(latestByLang, lang, lastmod);
      if (section !== 'pages') {
        trackLatest(latestBySection, `${lang}:${section}`, lastmod);
      }

      postEntries.push({
        loc: `${origin}/${lang}/${section}/${slug}/`,
        lastmod
      });
    }

    const staticEntries = [];
    for (const lang of SITEMAP_LANGS) {
      staticEntries.push({
        loc: `${origin}/${lang}/`,
        lastmod: latestByLang.get(lang) || ''
      });

      for (const section of SITEMAP_SECTIONS) {
        staticEntries.push({
          loc: `${origin}/${lang}/${section}/`,
          lastmod: latestBySection.get(`${lang}:${section}`) || ''
        });
      }
    }

    const entries = [...staticEntries, ...postEntries];
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    res.send(renderSitemapXml(entries));
  } catch (error) {
    next(error);
  }
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!config.adminLoginUser) {
    return jsonError(res, 500, 'Admin login is not configured');
  }
  if (!username || !password) {
    return jsonError(res, 400, 'username and password are required');
  }
  const storedHash = await getAppSetting(pool, 'admin_password_hash');
  if (!storedHash) {
    return jsonError(res, 500, 'Admin password is not configured');
  }
  if (!isAllowedAdmin(username, config) || !verifyPasswordHash(password, storedHash)) {
    return jsonError(res, 401, 'Invalid username or password');
  }

  const sessionValue = createSignedValue(
    {
      username,
      exp: Date.now() + 1000 * 60 * 60 * 12,
      via: 'local'
    },
    config.adminSessionSecret
  );

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', makeSetCookie(SESSION_COOKIE, sessionValue, 60 * 60 * 12, config));
  return jsonOk(res, {
    ok: true,
    authenticated: true,
    isAdmin: true,
    username
  });
});

app.get('/api/session', (req, res) => {
  const session = getAdminSession(req, config);
  res.setHeader('Cache-Control', 'no-store');
  jsonOk(res, {
    ok: true,
    authenticated: Boolean(session),
    isAdmin: Boolean(session),
    username: session?.username || null
  });
});

app.post('/api/admin/password', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const currentPassword = String(req.body?.currentPassword || '');
  const nextPassword = String(req.body?.newPassword || '');

  if (!currentPassword || !nextPassword) {
    return jsonError(res, 400, 'currentPassword and newPassword are required');
  }
  if (nextPassword.length < 10) {
    return jsonError(res, 400, 'New password must be at least 10 characters');
  }

  const storedHash = await getAppSetting(pool, 'admin_password_hash');
  if (!storedHash) {
    return jsonError(res, 500, 'Admin password is not configured');
  }
  if (!verifyPasswordHash(currentPassword, storedHash)) {
    return jsonError(res, 401, 'Current password is incorrect');
  }

  await setAppSetting(pool, 'admin_password_hash', hashPassword(nextPassword));
  return jsonOk(res, { ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', makeClearCookie(SESSION_COOKIE, config));
  res.setHeader('Cache-Control', 'no-store');
  jsonOk(res, { ok: true });
});

app.get('/api/posts', async (req, res, next) => {
  try {
    const isAdmin = isAdminRequest(req, config);
    const statusRaw = String(req.query.status || '').trim().toLowerCase();
    const statusFilter = isAdmin && statusRaw === 'all' ? 'all' : isAdmin && statusRaw === 'draft' ? 'draft' : 'published';
    const lang = normalizeLang(req.query.lang || 'en');
    const sectionRaw = req.query.section ? normalizeSection(req.query.section) : null;
    const q = String(req.query.q || '').trim().slice(0, 160);
    const menuId = numericId(req.query.menu);
    if (req.query.menu !== undefined && !menuId) return jsonError(res, 400, 'Invalid menu');
    const page = clamp(parseIntSafe(req.query.page, 1) || 1, 1, 10000);
    const limit = clamp(parseIntSafe(req.query.limit, 12) || 12, 1, 50);
    const offset = (page - 1) * limit;

    const binds = [lang];
    const where = ['p.is_deleted = FALSE', `p.lang = $${binds.length}`];

    if (sectionRaw) {
      binds.push(sectionRaw);
      where.push(`p.section = $${binds.length}`);
    }
    if (statusFilter !== 'all') {
      binds.push(statusFilter);
      where.push(`p.status = $${binds.length}`);
    }
    if (menuId) {
      binds.push(menuId);
      where.push(`p.menu_id = $${binds.length}`);
    }
    if (req.query.feed === '1') {
      where.push("(p.menu_id IS NOT NULL OR p.section IN ('blog', 'tools', 'games'))");
    }
    if (q) {
      binds.push(`%${q}%`);
      where.push(`p.title ILIKE $${binds.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM posts p ${whereSql}`, binds);

    const listBinds = [...binds, limit, offset];
    const rows = await pool.query(
      `SELECT p.* FROM posts p ${whereSql}
       ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC
       LIMIT $${listBinds.length - 1} OFFSET $${listBinds.length}`,
      listBinds
    );

    const items = rows.rows.map((row) => mapPostRow(row, req, publicBaseUrl));
    Object.entries(cacheHeadersForList(isAdmin, statusFilter, Boolean(q))).forEach(([k, v]) => res.setHeader(k, v));
    jsonOk(res, {
      ok: true,
      items,
      page,
      limit,
      total: Number(countResult.rows[0]?.total || 0)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts/:slug', async (req, res, next) => {
  try {
    const isAdmin = isAdminRequest(req, config);
    const slug = slugify(decodeURIComponent(req.params.slug || ''));
    if (!slug) return jsonError(res, 400, 'Invalid slug');
    const lang = normalizeLang(req.query.lang || 'en');
    const sectionRaw = req.query.section ? normalizeSection(req.query.section) : null;
    const binds = [slug, lang];
    const where = ['slug = $1', 'lang = $2', 'is_deleted = FALSE'];
    if (sectionRaw) {
      binds.push(sectionRaw);
      where.push(`section = $${binds.length}`);
    }
    if (!isAdmin) where.push(`status = 'published'`);
    const rows = await pool.query(
      `SELECT * FROM posts WHERE ${where.join(' AND ')} ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 1`,
      binds
    );
    const row = rows.rows[0];
    if (!row) return jsonError(res, 404, 'Post not found');
    let updatedViewCount = Number(row.view_count || 0);
    if (!isAdmin && row.status === 'published' && shouldTrackViewCount(row)) {
      const viewCookieName = `ub_post_view_${row.id}`;
      if (!String(req.headers.cookie || '').includes(`${viewCookieName}=1`)) {
        await touchViewCount(pool, Number(row.id));
        updatedViewCount += 1;
        res.append('Set-Cookie', `${viewCookieName}=1; Path=/; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`);
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    const post = mapPostRow({ ...row, view_count: updatedViewCount }, req, publicBaseUrl);
    jsonOk(res, { ok: true, post, cover: post.cover, media: [] });
  } catch (error) {
    next(error);
  }
});

function readPageSettings(payload, creating) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const fields = creating ? ['title', 'status', 'lang', 'menu_id', 'body_layout_json'] : ['title', 'status', 'menu_id', 'body_layout_json'];
  if (Object.keys(payload).some((key) => !fields.includes(key))) return null;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const { status, lang } = payload;
  const menuId = payload.menu_id;
  const layout = normalizeBodyLayoutJson(payload.body_layout_json);
  if (!title || title.length > 160 || !['draft', 'published'].includes(status) ||
      (creating && (!['ko', 'en'].includes(lang) || !layout)) ||
      (menuId !== null && !numericId(menuId)) || (payload.body_layout_json !== undefined && !layout)) return null;
  return { title, status, lang, menuId, layout: layout ? JSON.stringify(layout) : null };
}

app.post('/api/posts', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const page = readPageSettings(req.body, true);
  if (!page) return jsonError(res, 400, 'Invalid page settings');
  const slug = `page-${crypto.randomUUID()}`;
  const row = await withMenuWrite(pool, async (db) => {
    if (!await canAssignMenu(db, page.menuId, page.lang)) return null;
    const { rows: [created] } = await db.query(
      `INSERT INTO posts (slug, title, content_md, status, published_at, lang, section, menu_id, body_layout_json)
       VALUES ($1, $2, '', $3, CASE WHEN $3 = 'published' THEN NOW() END, $4, 'pages', $5, $6)
       RETURNING id, slug, section, lang`,
      [slug, page.title, page.status, page.lang, page.menuId, page.layout]
    );
    return created;
  });
  if (!row) return jsonError(res, 400, 'Invalid board for this language');
  jsonOk(res, { ok: true, ...row, id: Number(row.id) });
});

app.put('/api/posts/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = numericId(req.params.id);
  const page = readPageSettings(req.body, false);
  if (!id || !page) return jsonError(res, 400, 'Invalid page settings');
  const result = await withMenuWrite(pool, async (db) => {
    const { rows: [current] } = await db.query('SELECT lang FROM posts WHERE id = $1 AND NOT is_deleted', [id]);
    if (!current) return [404, 'Post not found'];
    if (!await canAssignMenu(db, page.menuId, current.lang)) return [400, 'Invalid board for this language'];
    const { rows: [updated] } = await db.query(
      `UPDATE posts SET title = $1, status = $2, menu_id = $3,
         body_layout_json = COALESCE($4, body_layout_json),
         published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, NOW()) END,
         updated_at = NOW()
       WHERE id = $5 AND NOT is_deleted RETURNING id, slug, section, lang`,
      [page.title, page.status, page.menuId, page.layout, id]
    );
    return updated ? [200, updated] : [404, 'Post not found'];
  });
  if (result[0] !== 200) return jsonError(res, ...result);
  jsonOk(res, { ok: true, ...result[1], id });
});

app.delete('/api/posts/:id', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const postId = parseIntSafe(req.params.id);
    if (!postId) return jsonError(res, 400, 'Invalid post id');
    const result = await softDeletePost(pool, postId);
    if (!result.rowCount) return jsonError(res, 404, 'Post not found');
    jsonOk(res, { ok: true });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/tools/trend-analyzer/analyze-ticker',
  rateLimit({ namespace: 'trend-analyzer-ticker', max: 12, windowMs: 10 * 60 * 1000 }),
  async (req, res, next) => {
    try {
      const ticker = normalizeTrendTicker(req.body?.ticker);
      if (!ticker) return jsonError(res, 400, 'ticker is required');

      const payload = await analyzeTrendTicker(ticker);
      res.setHeader('Cache-Control', 'no-store');
      jsonOk(res, { ok: true, payload });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  '/api/tools/trend-analyzer/analyze',
  rateLimit({ namespace: 'trend-analyzer-upload', max: 8, windowMs: 5 * 60 * 1000 }),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) return jsonError(res, 400, 'file is required');
      if (!isCsvUpload(file)) return jsonError(res, 415, 'Only CSV uploads are supported');

      const ticker = normalizeTrendTicker(req.body?.ticker);
      const payload = await analyzeTrendCsvUpload(file, ticker || undefined);
      res.setHeader('Cache-Control', 'no-store');
      jsonOk(res, { ok: true, payload });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  '/api/tools/chart-interpretation/analyze-ticker',
  rateLimit({ namespace: 'chart-interpretation-ticker', max: 12, windowMs: 10 * 60 * 1000 }),
  async (req, res, next) => {
    try {
      const ticker = normalizeTrendTicker(req.body?.ticker);
      if (!ticker) return jsonError(res, 400, 'ticker is required');

      const payload = await analyzeChartInterpretationTicker(ticker);
      res.setHeader('Cache-Control', 'no-store');
      jsonOk(res, payload);
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  '/api/tools/chart-interpretation/analyze-csv',
  rateLimit({ namespace: 'chart-interpretation-csv', max: 8, windowMs: 10 * 60 * 1000 }),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) return jsonError(res, 400, 'file is required');
      if (!isCsvUpload(file)) return jsonError(res, 415, 'Only CSV uploads are supported');

      const payload = await analyzeChartInterpretationCsvUpload(file, String(req.body?.title || '').trim());
      res.setHeader('Cache-Control', 'no-store');
      jsonOk(res, payload);
    } catch (error) {
      next(error);
    }
  }
);

app.get('/api/tools/chart-interpretation/artifacts/:runId/:filename', async (req, res, next) => {
  try {
    const runId = normalizeChartArtifactSegment(req.params.runId);
    const fileName = normalizeChartArtifactSegment(req.params.filename);
    if (!runId || !fileName) return jsonError(res, 400, 'Invalid artifact path');

    const runRoot = path.resolve(chartInterpretationRunsRoot(), runId);
    const target = path.resolve(runRoot, fileName);
    if (target !== path.join(runRoot, fileName)) return jsonError(res, 400, 'Invalid artifact path');

    await fs.access(target);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    res.sendFile(target);
  } catch (error) {
    next(error);
  }
});

app.get('/api/games/texas-holdem-tournament/stats', async (req, res, next) => {
  try {
    const playerName = normalizeHoldemPlayerName(req.query.playerName || '');
    const stats = await buildHoldemGameStats(playerName);
    res.setHeader('Cache-Control', 'no-store');
    jsonOk(res, { ok: true, ...stats });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/holdem-online/session',
  rateLimit({ namespace: 'holdem-online-session', max: 30, windowMs: 10 * 60 * 1000 }),
  async (req, res) => {
    const displayName = normalizeHoldemPlayerName(req.body?.displayName || '');
    const sessionToken = String(req.body?.sessionToken || '').trim();
    const result = holdemOnlineManager.issueSession({
      displayName,
      sessionToken: sessionToken || undefined,
    });

    if (!result.ok) {
      return jsonError(res, 400, result.error);
    }

    return jsonOk(res, {
      ok: true,
      sessionToken: result.session.sessionToken,
      playerId: result.session.playerId,
      displayName: result.session.displayName,
    });
  },
);

app.get(
  '/api/holdem-online/tables',
  rateLimit({ namespace: 'holdem-online-tables', max: 120, windowMs: 60 * 1000 }),
  async (_req, res) => {
    jsonOk(res, holdemOnlineManager.getTablesResponse());
  },
);

app.post(
  '/api/games/texas-holdem-tournament/play',
  rateLimit({ namespace: 'holdem-play-write', max: 30, windowMs: 10 * 60 * 1000 }),
  async (req, res, next) => {
    try {
      const playerName = normalizeHoldemPlayerName(req.body?.playerName || '');
      if (!playerName) return jsonError(res, 400, 'playerName is required');

      const runToken = createRunToken();
      const playCount = await registerGamePlay(pool, {
        gameSlug: HOLDEM_GAME_SLUG,
        playerName,
        runToken,
        ttlSeconds: HOLDEM_RUN_TOKEN_TTL_SECONDS
      });
      const stats = await buildHoldemGameStats(playerName);

      res.setHeader('Cache-Control', 'no-store');
      jsonOk(res, {
        ok: true,
        playerName,
        playCount,
        runToken,
        ...stats
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  '/api/games/texas-holdem-tournament/complete',
  rateLimit({ namespace: 'holdem-complete-write', max: 30, windowMs: 10 * 60 * 1000 }),
  async (req, res, next) => {
    try {
      const playerName = normalizeHoldemPlayerName(req.body?.playerName || '');
      const runToken = String(req.body?.runToken || '').trim();
      const finalPlace = parseIntSafe(req.body?.finalPlace);
      const levelReached = parseIntSafe(req.body?.levelReached);
      const handNumber = parseIntSafe(req.body?.handNumber, 0);
      const playerWon = req.body?.playerWon === true || String(req.body?.playerWon || '').trim().toLowerCase() === 'true';
      const maxLevelForHand = Math.floor(Math.max(handNumber - 1, 0) / HOLDEM_HANDS_PER_LEVEL) + 1;

      if (!playerName) return jsonError(res, 400, 'playerName is required');
      if (!runToken) return jsonError(res, 400, 'runToken is required');
      if (!finalPlace || finalPlace < 1 || finalPlace > HOLDEM_MAX_PLAYERS) {
        return jsonError(res, 400, 'finalPlace is invalid');
      }
      if (!levelReached || levelReached < 1) return jsonError(res, 400, 'levelReached is invalid');
      if (handNumber < 1) return jsonError(res, 400, 'handNumber is invalid');
      if (levelReached > maxLevelForHand) return jsonError(res, 400, 'levelReached is inconsistent with handNumber');
      if (playerWon && finalPlace !== 1) return jsonError(res, 400, 'playerWon is inconsistent with finalPlace');
      if (!playerWon && finalPlace === 1) return jsonError(res, 400, 'playerWon is inconsistent with finalPlace');

      const result = await recordGameLeaderboardEntryForRun(pool, {
        gameSlug: HOLDEM_GAME_SLUG,
        playerName,
        runToken,
        finalPlace,
        levelReached,
        handNumber,
        playerWon
      });

      if (!result.accepted) {
        return jsonError(res, 409, 'runToken is invalid or expired');
      }

      const stats = await buildHoldemGameStats(playerName);

      res.setHeader('Cache-Control', 'no-store');
      jsonOk(res, {
        ok: true,
        playerName,
        madeLeaderboard: result.madeLeaderboard,
        ...stats
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post('/api/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const file = req.file;
    const altRaw = String(req.body.alt || '').trim();
    if (!file) return jsonError(res, 400, 'file is required');
    const mimeType = file.mimetype || 'application/octet-stream';
    const allowed = [/^image\//i, /^video\//i, /^application\/pdf$/i].some((pattern) => pattern.test(mimeType));
    if (!allowed) return jsonError(res, 415, 'Unsupported file type');
    if (/^image\//i.test(mimeType) && !altRaw) return jsonError(res, 400, 'alt is required for image uploads');

    const kind = detectMediaKind(mimeType);
    const originalKey = buildStorageKey(mimeType);
    const originalPath = await saveBufferToKey(config, originalKey, file.buffer);
    let width = null;
    let height = null;
    let variants = [];
    if (kind === 'image') {
      const parsed = path.parse(originalKey);
      const keyBaseNoExt = path.posix.join(parsed.dir, parsed.name);
      const variantResult = await writeImageVariants(config, keyBaseNoExt, file.buffer);
      width = variantResult.width;
      height = variantResult.height;
      variants = variantResult.variants;
    }

    const mediaInsert = await pool.query(
      `INSERT INTO media (r2_key, kind, width, height, alt, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [originalKey, kind, width, height, altRaw || file.originalname || null, mimeType, file.size]
    );
    const mediaId = Number(mediaInsert.rows[0].id);

    for (const variant of variants) {
      await pool.query(
        `INSERT INTO media_variants (media_id, variant, r2_key, width, height, format)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [mediaId, variant.variant, variant.key, variant.width, variant.height, variant.format]
      );
    }

    const urls = buildMediaUrls({
      request: req,
      mediaId,
      variantNames: variants.map((item) => item.variant),
      publicBaseUrl
    });
    jsonOk(res, {
      ok: true,
      mediaId,
      keys: {
        original: originalKey,
        ...Object.fromEntries(variants.map((item) => [item.variant, item.key]))
      },
      urls,
      variants: variants.map((item) => ({ variant: item.variant, key: item.key, width: item.width, format: item.format }))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/media/:id', async (req, res, next) => {
  try {
    const mediaId = parseIntSafe(req.params.id);
    if (!mediaId) return jsonError(res, 400, 'Invalid media id');
    const media = await getMediaById(pool, mediaId);
    if (!media) return jsonError(res, 404, 'Media not found');
    const variants = await getMediaVariants(pool, mediaId);
    const urls = buildMediaUrls({
      request: req,
      mediaId,
      variantNames: variants.map((variant) => variant.variant),
      publicBaseUrl
    });
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    jsonOk(res, { ok: true, media, variants, urls });
  } catch (error) {
    next(error);
  }
});

app.get('/api/media/:id/file', async (req, res, next) => {
  try {
    const mediaId = parseIntSafe(req.params.id);
    if (!mediaId) return jsonError(res, 400, 'Invalid media id');
    const media = await getMediaById(pool, mediaId);
    if (!media) return jsonError(res, 404, 'Media not found');
    const requestedVariant = String(req.query.variant || '').trim();
    let key = media.r2_key;
    let mimeType = media.mime_type || 'application/octet-stream';
    if (requestedVariant) {
      const variants = await getMediaVariants(pool, mediaId);
      const found = variants.find((variant) => variant.variant === requestedVariant);
      if (found?.r2_key) {
        key = found.r2_key;
        mimeType = variantMimeType(found.format, mimeType);
      }
    }
    const filePath = resolveStoragePath(config, key);
    const buffer = await fs.readFile(filePath).catch(() => null);
    if (!buffer) return jsonError(res, 404, 'Media object not found');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : 'Unexpected error';
  const statusCode = Number(err?.statusCode || 500);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return jsonError(res, 413, 'File size exceeds 10MB limit');
  }
  console.error('[utility-box-api]', err);
  jsonError(res, Number.isFinite(statusCode) && statusCode >= 400 ? statusCode : 500, message);
});

await bootstrap();
const server = http.createServer(app);
server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws/holdem-online') {
      holdemOnlineManager.handleUpgrade(request, socket, head);
      return;
    }
    if (url.pathname === '/ws/mine-cart-duel-online') {
      mineCartDuelOnlineManager.handleUpgrade(request, socket, head);
      return;
    }
  } catch {
    // Fall through to socket destroy.
  }

  socket.destroy();
});
server.listen(config.port, () => {
  console.log(`[utility-box-api] listening on :${config.port}`);
});
