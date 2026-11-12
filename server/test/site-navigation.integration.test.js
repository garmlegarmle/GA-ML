import assert from 'node:assert/strict';
import test from 'node:test';

const base = process.env.GA_ML_TEST_API_URL;
const username = process.env.GA_ML_TEST_ADMIN_USER;
const password = process.env.GA_ML_TEST_ADMIN_PASSWORD;

test('메뉴 계층, 페이지 공개 범위와 주소, 삭제 후 콘텐츠 보존', { skip: !base }, async () => {
  assert.equal(new URL(base).hostname, '127.0.0.1', '격리된 로컬 테스트 API에서만 실행합니다.');
  assert.ok(username && password, '테스트 관리자 계정을 지정하세요.');
  const auth = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  assert.equal(auth.status, 200);
  const cookie = auth.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);

  const menuIds = new Set();
  const postIds = new Set();
  const layout = {
    version: 1,
    pages: [{ id: 'paper' }],
    elements: [{
      id: 'text', type: 'text', pageId: 'paper', x: 5, y: 5, width: 90, height: 25,
      zIndex: 1, visible: true, html: '<p>검증 본문</p>', style: {}
    }]
  };

  function request(path, { method = 'GET', body, admin = false } = {}) {
    return fetch(`${base}/api${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  async function result(path, options) {
    const response = await request(path, options);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  }
  const boardSettings = { lang: 'ko', kind: 'board', parentId: null, label: '검증 상위 메뉴', postId: null, position: 100, view: 'list' };
  async function menu(settings) {
    const { id } = await result('/menus', { method: 'POST', admin: true, body: { ...boardSettings, ...settings } });
    menuIds.add(id);
    return id;
  }

  try {
    const initial = (await result('/menus?lang=ko')).menus;
    assert.ok(initial.some((item) => item.legacySection === 'blog'));
    assert.equal((await request('/menus', { method: 'POST', body: boardSettings })).status, 401);
    assert.equal((await request('/posts', { method: 'POST', body: {} })).status, 401);
    const root = await menu({});
    const child = await menu({ parentId: root, label: '검증 하위 게시판', view: 'icons' });
    const english = await menu({ lang: 'en', label: 'Fixture board' });
    assert.equal((await request(`/menus/${root}`, { method: 'PUT', admin: true, body: { ...boardSettings, parentId: child } })).status, 400);
    assert.equal((await request('/menus', { method: 'POST', admin: true, body: { ...boardSettings, parentId: english } })).status, 400);

    const pageSettings = { lang: 'ko', title: '검증 페이지', status: 'draft', menu_id: child, body_layout_json: layout };
    assert.equal((await request('/posts', { method: 'POST', admin: true, body: { ...pageSettings, menu_id: english } })).status, 400);
    assert.equal((await request('/posts', { method: 'POST', admin: true, body: { ...pageSettings, slug: 'ignored' } })).status, 400);
    const page = await result('/posts', { method: 'POST', admin: true, body: pageSettings });
    postIds.add(page.id);
    assert.equal(page.section, 'pages');
    assert.match(page.slug, /^page-[0-9a-f-]{36}$/);
    const path = `/posts/${page.slug}?lang=ko&section=pages`;
    const linked = await menu({ parentId: child, kind: 'page', postId: page.id, label: '연결 페이지' });
    const nested = await menu({ parentId: linked, label: '연결 아래 게시판' });
    assert.equal((await request(path)).status, 404);
    assert.equal((await result(`/posts?lang=ko&menu=${child}&status=all`)).total, 0);
    const anonymousMenus = (await result('/menus?lang=ko&admin=1')).menus;
    assert.equal(anonymousMenus.some((item) => item.id === linked), false);
    assert.equal(anonymousMenus.find((item) => item.id === nested).parentId, child);
    const adminMenus = (await result('/menus?lang=ko&admin=1', { admin: true })).menus;
    assert.ok(adminMenus.some((item) => item.id === linked));
    assert.equal(adminMenus.find((item) => item.id === nested).parentId, linked);
    const updated = { title: '검증 페이지 수정', status: 'published', menu_id: child };
    assert.equal((await request(`/posts/${page.id}`, { method: 'PUT', admin: true, body: { ...updated, tags: ['removed'] } })).status, 400);
    const saved = await result(`/posts/${page.id}`, { method: 'PUT', admin: true, body: updated });
    assert.equal(saved.slug, page.slug);
    const published = (await result(path)).post;
    assert.equal(published.title, updated.title);
    assert.deepEqual(published.body_layout_json, layout);
    const menus = (await result('/menus?lang=ko')).menus;
    assert.equal(menus.find((item) => item.id === child).view, 'icons');
    assert.equal(menus.find((item) => item.id === linked).postPath, `/ko/pages/${page.slug}/`);
    assert.equal(menus.find((item) => item.id === nested).parentId, linked);
    assert.deepEqual((await result(`/posts?lang=ko&menu=${child}`)).items.map((item) => item.id), [page.id]);
    assert.equal((await result(`/posts?lang=ko&menu=${root}`)).total, 0);

    await result(`/menus/${child}`, { method: 'DELETE', admin: true });
    menuIds.delete(child);
    assert.equal((await result(path)).post.menuId, null);
    assert.equal((await result('/menus?lang=ko')).menus.find((item) => item.id === linked).parentId, root);
    await result(`/posts/${page.id}`, { method: 'PUT', admin: true, body: { ...updated, status: 'draft', menu_id: null } });
    assert.equal((await request(path)).status, 404);
    const afterDraft = (await result('/menus?lang=ko')).menus;
    assert.equal(afterDraft.some((item) => item.id === linked), false);
    assert.equal(afterDraft.find((item) => item.id === nested).parentId, root);
  } finally {
    for (const id of [...menuIds].reverse()) await request(`/menus/${id}`, { method: 'DELETE', admin: true });
    for (const id of postIds) await request(`/posts/${id}`, { method: 'DELETE', admin: true });
  }
});
