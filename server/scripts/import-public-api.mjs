import { getConfig } from '../src/config.js';
import { createPool, ensureSchema, ensureSeedPages, replacePostTags } from '../src/db.js';
import { normalizeLang, normalizeSection, normalizeStatus, parseCardRank, parseDateOrNull, slugify, toExcerpt } from '../src/validators.js';

const config = getConfig();
const pool = createPool(config);
const sourceBase = String(process.env.SOURCE_API_BASE || 'https://www.ga-ml.com/api').replace(/\/$/, '');
const langs = ['en', 'ko'];
const sections = ['blog', 'tools', 'games', 'pages'];
const limit = 100;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function upsertPost(item) {
  const slug = slugify(item.slug || item.title);
  const lang = normalizeLang(item.lang);
  const section = normalizeSection(item.section);
  const status = normalizeStatus(item.status || 'published');
  const excerpt = String(item.excerpt || '').trim() || toExcerpt(String(item.content_md || ''));
  const publishedAt = parseDateOrNull(item.published_at);
  const metaTitle = item.meta?.title ? String(item.meta.title).trim() : null;
  const metaDescription = item.meta?.description ? String(item.meta.description).trim() : null;
  const ogTitle = item.og?.title ? String(item.og.title).trim() : metaTitle || item.title;
  const ogDescription = item.og?.description ? String(item.og.description).trim() : metaDescription || excerpt;
  const ogImageUrl = item.og?.imageUrl ? String(item.og.imageUrl).trim() : null;
  const card = item.card || {};

  const existing = await pool.query(
    'SELECT id FROM posts WHERE slug = $1 AND lang = $2 AND section = $3 AND is_deleted = FALSE LIMIT 1',
    [slug, lang, section]
  );

  let postId;
  if (existing.rows[0]) {
    postId = Number(existing.rows[0].id);
    await pool.query(
      `UPDATE posts SET
         title=$1, excerpt=$2, content_md=$3, status=$4, published_at=$5,
         updated_at=NOW(), pair_slug=$6,
         card_title=$7, card_category=$8, card_tag=$9, card_rank=$10,
         meta_title=$11, meta_description=$12, og_title=$13, og_description=$14, og_image_url=$15, schema_type=$16
       WHERE id = $17`,
      [
        item.title,
        excerpt,
        item.content_md,
        status,
        publishedAt,
        item.pair_slug || null,
        card.title || item.title,
        card.category || section,
        card.tag || null,
        parseCardRank(card.rankNumber ?? card.rank),
        metaTitle,
        metaDescription,
        ogTitle,
        ogDescription,
        ogImageUrl,
        item.schemaType || null,
        postId
      ]
    );
  } else {
    const inserted = await pool.query(
      `INSERT INTO posts (
         slug, title, excerpt, content_md, status, published_at, created_at, updated_at,
         lang, section, pair_slug,
         card_title, card_category, card_tag, card_rank,
         meta_title, meta_description, og_title, og_description, og_image_url, schema_type
       ) VALUES (
         $1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()),COALESCE($8::timestamptz, NOW()),
         $9,$10,$11,
         $12,$13,$14,$15,
         $16,$17,$18,$19,$20,$21
       ) RETURNING id`,
      [
        slug,
        item.title,
        excerpt,
        item.content_md,
        status,
        publishedAt,
        parseDateOrNull(item.created_at),
        parseDateOrNull(item.updated_at),
        lang,
        section,
        item.pair_slug || null,
        card.title || item.title,
        card.category || section,
        card.tag || null,
        parseCardRank(card.rankNumber ?? card.rank),
        metaTitle,
        metaDescription,
        ogTitle,
        ogDescription,
        ogImageUrl,
        item.schemaType || null
      ]
    );
    postId = Number(inserted.rows[0].id);
  }

  await replacePostTags(pool, postId, Array.isArray(item.tags) ? item.tags : []);
  return postId;
}

async function main() {
  await ensureSchema(pool);
  await ensureSeedPages(pool);
  let imported = 0;

  for (const lang of langs) {
    for (const section of sections) {
      let page = 1;
      while (true) {
        const url = `${sourceBase}/posts?status=published&lang=${lang}&section=${section}&page=${page}&limit=${limit}`;
        const data = await fetchJson(url);
        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) break;
        for (const item of items) {
          await upsertPost(item);
          imported += 1;
        }
        if (items.length < limit) break;
        page += 1;
      }
    }
  }

  console.log(`[utility-box-import] imported/updated ${imported} published posts from ${sourceBase}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
