import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { nowIso, slugifyTag } from './validators.js';

const { Pool } = pg;
const GAME_LEADERBOARD_LIMIT = 10;

export function createPool(config) {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000
  });
}

export async function ensureSchema(pool) {
  const sqlPath = path.resolve(process.cwd(), 'sql/schema.pg.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  await pool.query(sql);
}

export async function ensureSeedPages(pool) {
  const pages = [
    ['about', 'About', 'About GA-ML.', '# About\n\nGA-ML provides practical tools and guides.', 'en'],
    ['contact', 'Contact', 'Contact GA-ML.', '# Contact\n\nFor inquiries, use the official contact channel.', 'en'],
    ['privacy-policy', 'Privacy Policy', 'Privacy policy details.', '# Privacy Policy\n\nWe only store data required for operating the service.', 'en'],
    ['about', '소개', 'GA-ML 소개', '# 소개\n\nGA-ML은 실용적인 도구와 가이드를 제공합니다.', 'ko'],
    ['contact', '문의하기', '문의 안내', '# 문의하기\n\n문의는 공식 채널로 보내주세요.', 'ko'],
    ['privacy-policy', '개인정보 처리방침', '개인정보 처리방침 안내', '# 개인정보 처리방침\n\n서비스 운영에 필요한 최소한의 정보만 처리합니다.', 'ko']
  ];

  for (const [slug, title, excerpt, content, lang] of pages) {
    await pool.query(
      `INSERT INTO posts (slug, title, excerpt, content_md, status, published_at, lang, section)
       SELECT $1, $2, $3, $4, 'published', NOW(), $5, 'pages'
       WHERE NOT EXISTS (SELECT 1 FROM posts WHERE slug = $1 AND lang = $5 AND section = 'pages')
       ON CONFLICT DO NOTHING`,
      [slug, title, excerpt, content, lang]
    );
  }
}

async function getPublishedContentCardCount(pool, lang) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM posts
     WHERE is_deleted = FALSE
       AND status = 'published'
       AND lang = $1
       AND section IN ('blog', 'tools', 'games')`,
    [lang]
  );
  return Number(result.rows[0]?.count || 0);
}

export async function getNextPublishedContentCardRank(pool, lang) {
  return (await getPublishedContentCardCount(pool, lang)) + 1;
}

export async function ensureSeedProgramPosts(pool) {
  const posts = [
    {
      slug: 'trend-analyzer',
      section: 'tools',
      title: 'Trend Analyzer',
      excerpt: 'Upload a local OHLCV CSV and review a 200-session trend analysis with chart overlays.',
      content:
        '# Trend Analyzer\n\nUse the built-in analyzer below to upload a CSV from the data downloader and review the chart, score ranges, and interpretation.',
      lang: 'en'
    },
    {
      slug: 'trend-analyzer',
      section: 'tools',
      title: '추세 분석기',
      excerpt: '로컬 OHLCV CSV를 업로드해 최근 200세션 기준 추세 분석과 차트 오버레이를 확인하세요.',
      content:
        '# 추세 분석기\n\n아래 내장 분석기에 데이터 다운로더가 만든 CSV를 업로드하면 차트, 범위형 점수, 해석 결과를 확인할 수 있습니다.',
      lang: 'ko'
    },
    {
      slug: 'chart-interpretation',
      section: 'tools',
      title: 'Chart Interpretation',
      excerpt: 'Run one ticker or upload an OHLCV CSV to read a discretionary-style chart report with scenarios, targets, and risk notes.',
      content:
        '# Chart Interpretation\n\nUse the built-in chart interpretation tool below to analyze one ticker or one OHLCV CSV and export the chart, HTML report, and JSON payload.',
      lang: 'en'
    },
    {
      slug: 'chart-interpretation',
      section: 'tools',
      title: '차트 해석기',
      excerpt: '티커 하나를 바로 실행하거나 OHLCV CSV를 업로드해 시나리오, 목표 구간, 리스크 메모가 포함된 재량형 차트 리포트를 확인할 수 있습니다.',
      content:
        '# 차트 해석기\n\n아래 내장 도구에서 티커 하나 또는 OHLCV CSV 하나를 분석하고, 차트 이미지와 HTML 리포트, JSON payload를 함께 확인할 수 있습니다.',
      lang: 'ko'
    },
    {
      slug: 'texas-holdem-tournament',
      section: 'games',
      title: "Texas Hold'em Tournament",
      excerpt: 'Play a browser-based single-table tournament against eight local AI opponents.',
      content:
        "# Texas Hold'em Tournament\n\nPlay a built-in single-table Texas Hold'em tournament against local AI opponents directly in the page below.",
      lang: 'en'
    },
    {
      slug: 'texas-holdem-tournament',
      section: 'games',
      title: '텍사스 홀덤 토너먼트',
      excerpt: '로컬 AI 8명을 상대로 브라우저 안에서 싱글 테이블 토너먼트를 플레이할 수 있습니다.',
      content:
        '# 텍사스 홀덤 토너먼트\n\n아래 내장 게임에서 로컬 AI 8명을 상대로 싱글 테이블 텍사스 홀덤 토너먼트를 바로 플레이할 수 있습니다.',
      lang: 'ko'
    },
    {
      slug: 'mine-cart-duel',
      section: 'games',
      title: 'Mine Cart Duel',
      excerpt: 'Use webcam hand tracking to duel a CPU opponent in a fast mine-cart shooter embedded directly in the page.',
      content:
        '# Mine Cart Duel\n\nPlay a hand-tracking duel game directly in the page below. Allow camera access inside the game when you press Start Game.',
      lang: 'en'
    },
    {
      slug: 'mine-cart-duel',
      section: 'games',
      title: '마인 카트 듀얼',
      excerpt: '웹캠 손 추적으로 CPU 상대와 빠른 광차 슈팅 듀얼을 플레이할 수 있는 내장 게임입니다.',
      content:
        '# 마인 카트 듀얼\n\n아래 내장 게임에서 손 추적 광차 듀얼을 바로 플레이할 수 있습니다. 게임 안에서 Start Game을 눌러 카메라 권한을 허용하세요.',
      lang: 'ko'
    }
  ];

  for (const item of posts) {
    const nextRank = await getNextPublishedContentCardRank(pool, item.lang);
    await pool.query(
      `INSERT INTO posts (slug, title, excerpt, content_md, status, published_at, lang, section, card_title, card_category, card_rank)
       SELECT $1, $2, $3, $4, 'published', NOW(), $5, $6, $2, $6, $7
       WHERE NOT EXISTS (SELECT 1 FROM posts WHERE slug=$1 AND lang=$5 AND section=$6)
       ON CONFLICT DO NOTHING`,
      [item.slug, item.title, item.excerpt, item.content, item.lang, item.section, nextRank]
    );
  }
}

export async function getAppSetting(pool, key) {
  const result = await pool.query('SELECT value FROM app_settings WHERE key = $1 LIMIT 1', [key]);
  return result.rows[0]?.value || null;
}

export async function setAppSetting(pool, key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

export async function upsertTags(pool, tags) {
  const out = [];
  for (const tag of tags) {
    const name = String(tag || '').trim();
    if (!name) continue;
    const slug = slugifyTag(name);
    if (!slug) continue;
    await pool.query(
      `INSERT INTO tags (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [name, slug]
    );
    const found = await pool.query('SELECT id FROM tags WHERE slug = $1 LIMIT 1', [slug]);
    if (found.rows[0]?.id) out.push(Number(found.rows[0].id));
  }
  return out;
}

export async function replacePostTags(pool, postId, tags) {
  const tagIds = await upsertTags(pool, tags);
  await pool.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);
  for (const tagId of tagIds) {
    await pool.query(
      'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [postId, tagId]
    );
  }
}

export async function getMediaById(pool, mediaId) {
  const rows = await pool.query('SELECT * FROM media WHERE id = $1 LIMIT 1', [mediaId]);
  return rows.rows[0] || null;
}

export async function getMediaVariants(pool, mediaId) {
  const rows = await pool.query('SELECT * FROM media_variants WHERE media_id = $1 ORDER BY id ASC', [mediaId]);
  return rows.rows;
}

function requestOrigin(request, publicOrigin = '') {
  if (publicOrigin) {
    return { origin: publicOrigin };
  }
  const forwardedProto = String(request.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(request.get('x-forwarded-host') || '').split(',')[0].trim();
  const protocol = forwardedProto || request.protocol;
  const host = forwardedHost || request.get('host');
  return { origin: `${protocol}://${host}` };
}

function parseLayoutBlocksJson(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseToolLayout(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseBodyLayoutJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
    if (!Array.isArray(parsed.pages) || !Array.isArray(parsed.elements)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function mapPostRow(row, request, publicOrigin = '') {
  const { origin } = requestOrigin(request, publicOrigin);
  const coverUrl = row.cover_image_id ? `${origin}/api/media/${row.cover_image_id}/file` : null;
  const cardImageUrl = row.card_image_id ? `${origin}/api/media/${row.card_image_id}/file` : null;
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    content_md: row.content_md,
    content_before_md: row.content_before_md || null,
    content_after_md: row.content_after_md || null,
    layout_blocks: parseLayoutBlocksJson(row.layout_blocks_json),
    body_layout_json: parseBodyLayoutJson(row.body_layout_json),
    status: row.status,
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    lang: row.lang,
    section: row.section,
    menuId: row.menu_id ? Number(row.menu_id) : null,
    pair_slug: row.pair_slug,
    view_count: Number(row.view_count || 0),
    cover: row.cover_image_id ? { id: Number(row.cover_image_id), url: coverUrl } : null,
    card: {
      rankNumber: row.card_rank ? Number(row.card_rank) : null,
      imageUrl: cardImageUrl,
      titleSize: row.card_title_size || 'auto'
    },
    tool_layout: parseToolLayout(row.tool_layout)
  };
}

export async function touchViewCount(pool, postId) {
  await pool.query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [postId]);
}

export async function softDeletePost(pool, postId) {
  return pool.query(
    'UPDATE posts SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE',
    [postId]
  );
}

export async function incrementGamePlayCount(pool, { gameSlug, playerName }) {
  const result = await pool.query(
    `INSERT INTO game_play_counts (game_slug, player_name, play_count, created_at, updated_at)
     VALUES ($1, $2, 1, NOW(), NOW())
     ON CONFLICT (game_slug, player_name)
     DO UPDATE SET play_count = game_play_counts.play_count + 1, updated_at = NOW()
     RETURNING play_count`,
    [gameSlug, playerName]
  );

  return Number(result.rows[0]?.play_count || 0);
}

export async function registerGamePlay(pool, { gameSlug, playerName, runToken, ttlSeconds }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM game_run_sessions
       WHERE game_slug = $1
         AND (expires_at <= NOW() OR consumed_at IS NOT NULL)`,
      [gameSlug]
    );

    const playResult = await client.query(
      `INSERT INTO game_play_counts (game_slug, player_name, play_count, created_at, updated_at)
       VALUES ($1, $2, 1, NOW(), NOW())
       ON CONFLICT (game_slug, player_name)
       DO UPDATE SET play_count = game_play_counts.play_count + 1, updated_at = NOW()
       RETURNING play_count`,
      [gameSlug, playerName]
    );

    await client.query(
      `INSERT INTO game_run_sessions (
         run_token, game_slug, player_name, created_at, expires_at
       ) VALUES ($1, $2, $3, NOW(), NOW() + make_interval(secs => $4))`,
      [runToken, gameSlug, playerName, ttlSeconds]
    );

    await client.query('COMMIT');
    return Number(playResult.rows[0]?.play_count || 0);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getGamePlaySummary(pool, { gameSlug, playerName = null }) {
  const totalResult = await pool.query(
    `SELECT COALESCE(SUM(play_count), 0)::int AS total_plays
     FROM game_play_counts
     WHERE game_slug = $1`,
    [gameSlug]
  );

  let playerPlays = 0;
  if (playerName) {
    const playerResult = await pool.query(
      `SELECT play_count
       FROM game_play_counts
       WHERE game_slug = $1 AND player_name = $2
       LIMIT 1`,
      [gameSlug, playerName]
    );
    playerPlays = Number(playerResult.rows[0]?.play_count || 0);
  }

  return {
    totalPlays: Number(totalResult.rows[0]?.total_plays || 0),
    playerPlays
  };
}

export async function listGameLeaderboard(pool, { gameSlug, limit = GAME_LEADERBOARD_LIMIT }) {
  const result = await pool.query(
    `SELECT
       id,
       player_name,
       final_place,
       level_reached,
       hand_number,
       player_won,
       created_at,
       ROW_NUMBER() OVER (
         ORDER BY
           CASE WHEN player_won THEN 1 ELSE 0 END DESC,
           final_place ASC,
           level_reached DESC,
           hand_number DESC,
           created_at ASC,
           id ASC
       )::int AS leaderboard_rank
     FROM game_leaderboard_entries
     WHERE game_slug = $1
     ORDER BY
       CASE WHEN player_won THEN 1 ELSE 0 END DESC,
       final_place ASC,
       level_reached DESC,
       hand_number DESC,
       created_at ASC,
       id ASC
     LIMIT $2`,
    [gameSlug, limit]
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    rank: Number(row.leaderboard_rank || 0),
    playerName: String(row.player_name || '').trim(),
    finalPlace: Number(row.final_place || 0),
    levelReached: Number(row.level_reached || 0),
    handNumber: Number(row.hand_number || 0),
    playerWon: Boolean(row.player_won),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  }));
}

export async function recordGameLeaderboardEntry(
  pool,
  { gameSlug, playerName, finalPlace, levelReached, handNumber, playerWon }
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insert = await client.query(
      `INSERT INTO game_leaderboard_entries (
         game_slug, player_name, final_place, level_reached, hand_number, player_won, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [gameSlug, playerName, finalPlace, levelReached, handNumber, playerWon]
    );

    const entryId = Number(insert.rows[0]?.id || 0);

    await client.query(
      `WITH ranked AS (
         SELECT
           id,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE WHEN player_won THEN 1 ELSE 0 END DESC,
               final_place ASC,
               level_reached DESC,
               hand_number DESC,
               created_at ASC,
               id ASC
           ) AS leaderboard_rank
         FROM game_leaderboard_entries
         WHERE game_slug = $1
       )
       DELETE FROM game_leaderboard_entries entry
       USING ranked
       WHERE entry.id = ranked.id
         AND ranked.leaderboard_rank > $2`,
      [gameSlug, GAME_LEADERBOARD_LIMIT]
    );

    const kept = await client.query(
      `SELECT 1
       FROM game_leaderboard_entries
       WHERE id = $1
       LIMIT 1`,
      [entryId]
    );

    await client.query('COMMIT');
    return {
      entryId,
      madeLeaderboard: Boolean(kept.rows[0])
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordGameLeaderboardEntryForRun(
  pool,
  { gameSlug, playerName, runToken, finalPlace, levelReached, handNumber, playerWon }
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `UPDATE game_run_sessions
       SET consumed_at = NOW()
       WHERE run_token = $1
         AND game_slug = $2
         AND player_name = $3
         AND consumed_at IS NULL
         AND expires_at > NOW()
       RETURNING run_token`,
      [runToken, gameSlug, playerName]
    );

    if (!sessionResult.rows[0]) {
      await client.query('ROLLBACK');
      return {
        entryId: 0,
        madeLeaderboard: false,
        accepted: false
      };
    }

    const insert = await client.query(
      `INSERT INTO game_leaderboard_entries (
         game_slug, player_name, final_place, level_reached, hand_number, player_won, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [gameSlug, playerName, finalPlace, levelReached, handNumber, playerWon]
    );

    const entryId = Number(insert.rows[0]?.id || 0);

    await client.query(
      `WITH ranked AS (
         SELECT
           id,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE WHEN player_won THEN 1 ELSE 0 END DESC,
               final_place ASC,
               level_reached DESC,
               hand_number DESC,
               created_at ASC,
               id ASC
           ) AS leaderboard_rank
         FROM game_leaderboard_entries
         WHERE game_slug = $1
       )
       DELETE FROM game_leaderboard_entries entry
       USING ranked
       WHERE entry.id = ranked.id
         AND ranked.leaderboard_rank > $2`,
      [gameSlug, GAME_LEADERBOARD_LIMIT]
    );

    const kept = await client.query(
      `SELECT 1
       FROM game_leaderboard_entries
       WHERE id = $1
       LIMIT 1`,
      [entryId]
    );

    await client.query(
      `DELETE FROM game_run_sessions
       WHERE game_slug = $1
         AND (expires_at <= NOW() OR consumed_at IS NOT NULL)`,
      [gameSlug]
    );

    await client.query('COMMIT');
    return {
      entryId,
      madeLeaderboard: Boolean(kept.rows[0]),
      accepted: true
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function nowDb() {
  return nowIso();
}
