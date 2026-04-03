import crypto from 'node:crypto';

const MARKET_TABLES = Object.freeze({
  us: 'us_equity_daily',
  kr: 'kr_equity_daily'
});

const KR_SUFFIX_RE = /\.(KS|KQ)$/i;
const inflightMarketSyncs = new Map();

function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function inferMarketFromTicker(ticker) {
  const normalized = String(ticker || '').trim().toUpperCase();
  if (KR_SUFFIX_RE.test(normalized)) return 'kr';
  if (/^\d{6}$/.test(normalized)) return 'kr';
  return 'us';
}

export function normalizeMarketTicker(ticker, market = 'auto') {
  const normalized = String(ticker || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '');
  const resolvedMarket = market === 'auto' ? inferMarketFromTicker(normalized) : market;

  if (resolvedMarket === 'kr') {
    const compact = normalized.replace(KR_SUFFIX_RE, '');
    if (!/^\d{6}$/.test(compact)) {
      throw createError('Korean tickers must be six digits, optionally with .KS or .KQ suffix.', 400);
    }
    return { ticker: compact, market: 'kr' };
  }

  if (!normalized) {
    throw createError('ticker is required', 400);
  }
  return { ticker: normalized, market: 'us' };
}

function marketTable(market) {
  const table = MARKET_TABLES[market];
  if (!table) throw createError(`Unsupported market: ${market}`, 500);
  return table;
}

export async function getStoredTickerStats(pool, { ticker, market = 'auto' }) {
  const normalized = normalizeMarketTicker(ticker, market);
  const table = marketTable(normalized.market);
  const result = await pool.query(
    `SELECT COUNT(*)::int AS row_count,
            MIN(trade_date) AS first_trade_date,
            MAX(trade_date) AS last_trade_date
       FROM ${table}
      WHERE ticker = $1`,
    [normalized.ticker]
  );
  const row = result.rows[0] || {};
  return {
    ticker: normalized.ticker,
    market: normalized.market,
    rowCount: Number(row.row_count || 0),
    firstTradeDate: row.first_trade_date ? new Date(row.first_trade_date).toISOString().slice(0, 10) : null,
    lastTradeDate: row.last_trade_date ? new Date(row.last_trade_date).toISOString().slice(0, 10) : null
  };
}

export async function trimStoredTickerRows(pool, { ticker, market = 'auto', keepRows = 260 }) {
  const normalized = normalizeMarketTicker(ticker, market);
  const table = marketTable(normalized.market);
  const safeKeepRows = Math.max(1, Number(keepRows || 0));
  const result = await pool.query(
    `WITH ranked_rows AS (
       SELECT trade_date,
              ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS row_number
         FROM ${table}
        WHERE ticker = $1
     )
     DELETE FROM ${table}
      WHERE ticker = $1
        AND trade_date IN (
          SELECT trade_date
            FROM ranked_rows
           WHERE row_number > $2
        )`,
    [normalized.ticker, safeKeepRows]
  );
  return Number(result.rowCount || 0);
}

function marketDataSyncConfigured(config) {
  return Boolean(
    config.marketDataGithubToken &&
      config.marketDataGithubOwner &&
      config.marketDataGithubRepo &&
      config.marketDataGithubRef &&
      config.marketDataUsWorkflow &&
      config.marketDataKrWorkflow
  );
}

function workflowFileForMarket(config, market) {
  return market === 'kr' ? config.marketDataKrWorkflow : config.marketDataUsWorkflow;
}

async function githubApiRequest(config, pathname, init = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method: init.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.marketDataGithubToken}`,
      'User-Agent': 'ga-ml-market-sync',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {})
    },
    body: init.body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw createError(
      `GitHub Actions request failed with status ${response.status}. ${String(text || '').slice(0, 240)}`.trim(),
      502
    );
  }

  return response;
}

async function dispatchMarketDataWorkflow(config, { market, ticker, retainRows, initialLookbackDays }) {
  const requestId = crypto.randomUUID();
  const workflow = workflowFileForMarket(config, market);
  const ref = config.marketDataGithubRef;

  await githubApiRequest(
    config,
    `/repos/${encodeURIComponent(config.marketDataGithubOwner)}/${encodeURIComponent(config.marketDataGithubRepo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        ref,
        inputs: {
          tickers: ticker,
          request_id: requestId,
          retain_max_rows: String(retainRows),
          initial_lookback_days: String(initialLookbackDays)
        }
      })
    }
  );

  return {
    requestId,
    workflow,
    ref,
    dispatchedAtMs: Date.now()
  };
}

function findMatchingWorkflowRun(runs, requestId, ref, dispatchedAtMs) {
  const needle = String(requestId || '').trim().toLowerCase();
  const candidates = Array.isArray(runs) ? runs : [];
  const exact = candidates.find((run) =>
    String(run?.display_title || run?.name || '')
      .toLowerCase()
      .includes(needle)
  );
  if (exact) return exact;

  return candidates
    .filter((run) => String(run?.head_branch || '').trim() === ref)
    .filter((run) => {
      const createdAt = Date.parse(String(run?.created_at || run?.run_started_at || ''));
      return Number.isFinite(createdAt) && createdAt >= dispatchedAtMs - 10_000;
    })
    .sort((left, right) => Date.parse(String(right?.created_at || '')) - Date.parse(String(left?.created_at || '')))[0] || null;
}

async function listWorkflowRuns(config, { workflow, ref }) {
  const response = await githubApiRequest(
    config,
    `/repos/${encodeURIComponent(config.marketDataGithubOwner)}/${encodeURIComponent(config.marketDataGithubRepo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=20`
  );
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
}

async function waitForWorkflowRun(config, dispatchMeta) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(10_000, Number(config.marketDataGithubTimeoutMs || 120_000));
  const pollMs = Math.max(1_000, Number(config.marketDataGithubPollMs || 4_000));

  let run = null;
  while (!run && Date.now() - startedAt < timeoutMs) {
    const runs = await listWorkflowRuns(config, dispatchMeta);
    run = findMatchingWorkflowRun(runs, dispatchMeta.requestId, dispatchMeta.ref, dispatchMeta.dispatchedAtMs);
    if (run) break;
    await sleep(pollMs);
  }

  if (!run) {
    throw createError(
      `GitHub Actions market-data sync was dispatched for ${dispatchMeta.requestId}, but no matching workflow run appeared before timeout.`,
      504
    );
  }

  while (Date.now() - startedAt < timeoutMs) {
    if (String(run.status || '').toLowerCase() === 'completed') {
      return run;
    }
    await sleep(pollMs);
    const runs = await listWorkflowRuns(config, dispatchMeta);
    run = findMatchingWorkflowRun(runs, dispatchMeta.requestId, dispatchMeta.ref, dispatchMeta.dispatchedAtMs) || run;
  }

  throw createError(
    `GitHub Actions market-data sync timed out for ${dispatchMeta.requestId}. ${run?.html_url || ''}`.trim(),
    504
  );
}

function hasFreshEnoughData(stats, maxStalenessDays) {
  if (!stats?.lastTradeDate) return false;
  const lastTradeMs = Date.parse(`${stats.lastTradeDate}T00:00:00Z`);
  if (!Number.isFinite(lastTradeMs)) return false;
  const ageMs = Date.now() - lastTradeMs;
  return ageMs <= Math.max(1, maxStalenessDays) * 24 * 60 * 60 * 1000;
}

function missingSyncConfigMessage(ticker) {
  const safeTicker = String(ticker || '').trim().toUpperCase() || 'the requested ticker';
  return `Stored market data for ${safeTicker} is missing or insufficient, and on-demand GitHub Actions sync is not configured on the server. Set MARKET_DATA_GITHUB_TOKEN, MARKET_DATA_GITHUB_OWNER, MARKET_DATA_GITHUB_REPO, MARKET_DATA_GITHUB_REF, MARKET_DATA_US_WORKFLOW, and MARKET_DATA_KR_WORKFLOW, or upload a CSV instead.`;
}

function failedWorkflowMessage(ticker, run) {
  const safeTicker = String(ticker || '').trim().toUpperCase() || 'the requested ticker';
  const runUrl = String(run?.html_url || '').trim();
  return `GitHub Actions market-data sync failed for ${safeTicker}.${runUrl ? ` ${runUrl}` : ''}`;
}

export async function ensureMarketDataReady(pool, config, { ticker, requiredRows = 260, retainRows = 260 }) {
  const normalized = normalizeMarketTicker(ticker, 'auto');
  const key = `${normalized.market}:${normalized.ticker}:${requiredRows}:${retainRows}`;
  const existing = inflightMarketSyncs.get(key);
  if (existing) return existing;

  const job = (async () => {
    let stats = await getStoredTickerStats(pool, normalized);
    if (stats.rowCount > retainRows) {
      await trimStoredTickerRows(pool, { ...normalized, keepRows: retainRows });
      stats = await getStoredTickerStats(pool, normalized);
    }

    if (stats.rowCount >= requiredRows && hasFreshEnoughData(stats, config.marketDataMaxStalenessDays)) {
      return {
        ...stats,
        syncTriggered: false,
        syncRunUrl: null
      };
    }

    if (!marketDataSyncConfigured(config)) {
      throw createError(missingSyncConfigMessage(normalized.ticker), 503);
    }

    const dispatchMeta = await dispatchMarketDataWorkflow(config, {
      market: normalized.market,
      ticker: normalized.ticker,
      retainRows,
      initialLookbackDays: config.marketDataInitialLookbackDays
    });
    const run = await waitForWorkflowRun(config, dispatchMeta);
    if (String(run?.conclusion || '').toLowerCase() !== 'success') {
      throw createError(failedWorkflowMessage(normalized.ticker, run), 502);
    }

    stats = await getStoredTickerStats(pool, normalized);
    if (stats.rowCount > retainRows) {
      await trimStoredTickerRows(pool, { ...normalized, keepRows: retainRows });
      stats = await getStoredTickerStats(pool, normalized);
    }

    if (stats.rowCount < requiredRows) {
      throw createError(
        `GitHub Actions sync completed for ${normalized.ticker}, but only ${stats.rowCount} stored rows are available. Need at least ${requiredRows}. ${String(run?.html_url || '').trim()}`.trim(),
        503
      );
    }

    return {
      ...stats,
      syncTriggered: true,
      syncRunUrl: String(run?.html_url || '').trim() || null
    };
  })();

  inflightMarketSyncs.set(key, job);
  try {
    return await job;
  } finally {
    if (inflightMarketSyncs.get(key) === job) {
      inflightMarketSyncs.delete(key);
    }
  }
}
