import { Router } from 'express';
import { getAppSetting, setAppSetting } from './db.js';
import { jsonError, jsonOk, normalizeLang } from './validators.js';

export function numericId(value) {
  const id = typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function withMenuWrite(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(6843031)');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureSiteMenus(pool) {
  await withMenuWrite(pool, async (db) => {
    const marker = 'site_menus_migrated_v1';
    if (await getAppSetting(db, marker)) return;
    for (const lang of ['ko', 'en']) {
      await db.query(
        `INSERT INTO site_menus (lang, label, kind, post_id, position)
         SELECT $1, $2, 'page', id, 10 FROM posts
         WHERE lang = $1 AND section = 'pages' AND slug = 'about' AND NOT is_deleted`,
        [lang, lang === 'ko' ? '소개' : 'About']
      );
      const boards = lang === 'ko' ? ['도구', '게임', '블로그'] : ['Tools', 'Games', 'Blog'];
      for (const [index, section] of ['tools', 'games', 'blog'].entries()) {
        const { rows: [menu] } = await db.query(
          `INSERT INTO site_menus (lang, label, kind, view, position, legacy_section)
           VALUES ($1, $2, 'board', 'icons', $3, $4) RETURNING id`,
          [lang, boards[index], 20 + index * 10, section]
        );
        await db.query('UPDATE posts SET menu_id = $1 WHERE lang = $2 AND section = $3 AND menu_id IS NULL', [menu.id, lang, section]);
      }
    }
    await setAppSetting(db, marker, '1');
  });
}

function toMenu(row) {
  return {
    id: Number(row.id), parentId: row.projected_parent_id ? Number(row.projected_parent_id) : null, label: row.label,
    kind: row.kind, view: row.view, position: row.position, legacySection: row.legacy_section,
    postId: row.post_id ? Number(row.post_id) : null,
    postPath: row.slug && !row.is_deleted ? `/${row.lang}/${row.section}/${row.slug}/` : null
  };
}

export async function canAssignMenu(db, menuId, lang) {
  if (menuId === null) return true;
  if (!numericId(menuId)) return false;
  const result = await db.query("SELECT 1 FROM site_menus WHERE id = $1 AND lang = $2 AND kind = 'board'", [menuId, lang]);
  return result.rowCount > 0;
}

export function createSiteMenusRouter(pool, requireAdmin, isAdmin) {
  const router = Router();
  router.get('/', async (req, res) => {
    const lang = normalizeLang(req.query.lang);
    const admin = req.query.admin === '1' && isAdmin(req);
    const { rows } = await pool.query(
      `WITH RECURSIVE candidates AS (
         SELECT m.*, p.slug, p.section, p.is_deleted,
                m.kind = 'board' OR COALESCE(p.status = 'published' AND NOT p.is_deleted, FALSE) AS visible
         FROM site_menus m LEFT JOIN posts p ON p.id = m.post_id
         WHERE m.lang = $1
       ), tree AS (
         SELECT m.*, NULL::bigint AS public_parent, CASE WHEN visible THEN id END AS public_anchor
         FROM candidates m WHERE parent_id IS NULL
         UNION ALL
         SELECT m.*, t.public_anchor, CASE WHEN m.visible THEN m.id ELSE t.public_anchor END
         FROM candidates m JOIN tree t ON t.id = m.parent_id
       )
       SELECT *, CASE WHEN $2::boolean THEN parent_id ELSE public_parent END AS projected_parent_id
       FROM tree WHERE $2::boolean OR visible ORDER BY position, id`, [lang, admin]
    );
    res.set('Cache-Control', 'no-store');
    jsonOk(res, { ok: true, menus: rows.map(toMenu) });
  });

  async function save(req, res, id = null) {
    if (!requireAdmin(req, res)) return;
    const { label: rawLabel, kind, view, lang, position, parentId, postId } = req.body || {};
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (!label || label.length > 80 || !['ko', 'en'].includes(lang) || !['board', 'page'].includes(kind) ||
        !['list', 'icons'].includes(view) || !Number.isInteger(position) || position < 0 || position > 9999 ||
        (parentId !== null && !numericId(parentId)) || (kind === 'page' && !numericId(postId))) {
      return jsonError(res, 400, 'Invalid menu settings');
    }
    const result = await withMenuWrite(pool, async (db) => {
      const { rows } = await db.query('SELECT id, parent_id, kind, post_id FROM site_menus WHERE lang = $1', [lang]);
      const menus = new Map(rows.map((menu) => [Number(menu.id), menu]));
      const current = menus.get(id);
      if (id && !current) return [404, 'Menu not found'];
      if (current && current.kind !== kind) return [400, 'Menu type cannot change'];
      if (!id && menus.size >= 150) return [400, 'Menu limit reached'];
      let parent = numericId(parentId);
      while (parent) {
        if (parent === id || !menus.has(parent)) return [400, 'Invalid parent menu'];
        parent = numericId(menus.get(parent).parent_id);
      }
      if (kind === 'page') {
        const target = await db.query('SELECT id FROM posts WHERE id = $1 AND lang = $2 AND NOT is_deleted', [postId, lang]);
        if (!target.rowCount) return [400, 'Page not found in this language'];
      }
      const values = [label, kind, view, lang, position, parentId, kind === 'page' ? postId : null];
      const saved = id
        ? await db.query(
          'UPDATE site_menus SET label=$1, kind=$2, view=$3, lang=$4, position=$5, parent_id=$6, post_id=$7 WHERE id=$8 RETURNING id',
          [...values, id]
        )
        : await db.query(
          'INSERT INTO site_menus (label, kind, view, lang, position, parent_id, post_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          values
        );
      return [200, Number(saved.rows[0].id)];
    });
    if (result[0] !== 200) return jsonError(res, ...result);
    jsonOk(res, { ok: true, id: result[1] });
  }

  router.post('/', (req, res) => save(req, res));
  router.put('/:id', (req, res) => {
    const id = numericId(req.params.id);
    return id ? save(req, res, id) : jsonError(res, 404, 'Menu not found');
  });
  router.delete('/:id', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = numericId(req.params.id);
    if (!id) return jsonError(res, 404, 'Menu not found');
    const deleted = await withMenuWrite(pool, async (db) => {
      const { rows: [menu] } = await db.query('SELECT parent_id FROM site_menus WHERE id = $1', [id]);
      if (!menu) return false;
      await db.query('UPDATE site_menus SET parent_id = $1 WHERE parent_id = $2', [menu.parent_id, id]);
      await db.query('DELETE FROM site_menus WHERE id = $1', [id]);
      return true;
    });
    if (!deleted) return jsonError(res, 404, 'Menu not found');
    jsonOk(res, { ok: true });
  });
  return router;
}
