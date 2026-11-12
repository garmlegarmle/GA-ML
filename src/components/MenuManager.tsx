import { useEffect, useState } from 'react';
import { deleteMenu, listPosts, saveMenu } from '../lib/api';
import { menuChoices } from '../lib/navigation';
import { t } from '../lib/site';
import type { MenuSettings, PostItem, SiteLang, SiteMenu } from '../types';
import { useSiteNavigation } from './SiteNavigation';

function initialMenu(lang: SiteLang, menus: SiteMenu[], parentId: number | null = null): MenuSettings {
  const order = Math.max(0, ...menus.filter((menu) => menu.parentId === parentId).map((menu) => menu.position));
  return { lang, parentId, label: '', kind: 'board', view: 'list', position: Math.min(order + 10, 9999), postId: null };
}

export function MenuManager({ lang }: { lang: SiteLang }) {
  const { menus, pending, error: menuError, refresh } = useSiteNavigation();
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<MenuSettings>();
  const [targets, setTargets] = useState<PostItem[]>();
  const [targetError, setTargetError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const ko = lang === 'ko';
  const choices = menuChoices(menus);
  const selectingPage = form?.kind === 'page';

  useEffect(() => {
    if (!selectingPage) return;
    let current = true;
    setTargetError(false);
    async function load() {
      const items: PostItem[] = [];
      let page = 1;
      while (current) {
        const response = await listPosts({ lang, status: 'all', limit: 50, page });
        items.push(...response.items);
        if (items.length >= response.total || !response.items.length) break;
        page++;
      }
      if (current) setTargets(items.sort((a, b) => a.title.localeCompare(b.title, lang)));
    }
    load().catch(() => { if (current) { setTargets(undefined); setTargetError(true); } });
    return () => { current = false; };
  }, [lang, selectingPage]);

  function choose(menu?: SiteMenu, parentId: number | null = null) {
    setEditing(menu?.id ?? null);
    setForm(menu ? {
      lang, parentId: menu.parentId, label: menu.label, kind: menu.kind,
      view: menu.view, position: menu.position, postId: menu.postId
    } : initialMenu(lang, menus, parentId));
    setError('');
    setNotice('');
  }

  function change(patch: Partial<MenuSettings>) {
    setForm((current) => current && { ...current, ...patch });
  }

  async function persist() {
    if (!form || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveMenu(editing, form);
      setEditing(saved.id);
      setNotice(ko ? '메뉴를 저장했습니다.' : 'Menu saved.');
      refresh();
    } catch {
      setError(ko ? '메뉴를 저장하지 못했습니다. 입력과 상위 메뉴를 확인해 주세요.' : 'Could not save the menu. Check its settings and parent.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (editing === null || busy || !window.confirm(ko
      ? '이 메뉴를 삭제할까요? 페이지는 남고, 하위 메뉴는 한 단계 위로 이동합니다.'
      : 'Delete this menu? Its pages are kept and its submenus move up one level.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await deleteMenu(editing);
      setEditing(null); setForm(undefined);
      setNotice(ko ? '메뉴를 삭제했습니다. 페이지는 보존했습니다.' : 'Menu deleted. Its pages were kept.');
      refresh();
    } catch {
      setError(ko ? '메뉴를 삭제하지 못했습니다. 다시 시도해 주세요.' : 'Could not delete the menu. Try again.');
    } finally { setBusy(false); }
  }

  const invalidParents = new Set(editing === null ? [] : [editing, ...menuChoices(menus, editing).map(({ menu }) => menu.id)]);
  return (
    <section className="workspace">
      <header className="workspace-heading">
        <h1>{ko ? '메뉴 관리' : 'Menus'}</h1>
        <button type="button" className="workspace-button--primary" disabled={busy || pending || menuError} onClick={() => choose()}>{ko ? '메뉴 추가' : 'Add menu'}</button>
      </header>
      <p className="workspace-muted">{ko ? '페이지를 바로 연결하거나, 여러 페이지를 담을 게시판을 만들 수 있습니다.' : 'Link to a page or create a board to collect pages.'}</p>
      {notice && <p className="workspace-message" role="status">{notice}</p>}
      {error && <p className="workspace-message workspace-message--error" role="alert">{error}</p>}
      {menuError && <p role="alert">{ko ? '메뉴를 불러오지 못했습니다.' : 'Could not load menus.'}</p>}
      <div className="menu-workspace">
        <div className="manager-tree" aria-busy={pending}>
          <h2>{ko ? '메뉴 구조' : 'Menu structure'}</h2>
          {pending && !choices.length && <p role="status">{t(lang, 'common.loading')}</p>}
          {!pending && !menuError && !choices.length && <p className="workspace-muted">{ko ? '아직 메뉴가 없습니다.' : 'No menus yet.'}</p>}
          <ul>{choices.map(({ menu, depth }) => <li key={menu.id} style={{ paddingInlineStart: Math.min(depth, 6) * 15 }}>
            <button type="button" className="manager-tree__entry" aria-pressed={editing === menu.id} disabled={busy} onClick={() => choose(menu)}>
              <span>{menu.label}</span><small>{menu.kind === 'board' ? (ko ? '게시판' : 'Board') : (ko ? '페이지' : 'Page')}</small>
            </button>
          </li>)}</ul>
        </div>
        {form ? <form className="manager-form" onSubmit={(event) => { event.preventDefault(); void persist(); }}>
          <h2>{editing === null ? (ko ? '새 메뉴' : 'New menu') : (ko ? '메뉴 설정' : 'Menu settings')}</h2>
          <fieldset disabled={busy}>
            <label>{ko ? '이름' : 'Name'}<input required maxLength={80} value={form.label} onChange={(event) => change({ label: event.target.value })} /></label>
            <label>{ko ? '상위 메뉴' : 'Parent menu'}<select aria-label={ko ? '상위 메뉴' : 'Parent menu'} value={form.parentId ?? ''} onChange={(event) => change({ parentId: Number(event.target.value) || null })}>
              <option value="">{ko ? '최상위' : 'Top level'}</option>
              {choices.filter(({ menu }) => !invalidParents.has(menu.id)).map(({ menu, depth }) =>
                <option key={menu.id} value={menu.id}>{'　'.repeat(Math.min(depth, 6))}{menu.label}</option>)}
            </select></label>
            <label>{ko ? '연결 유형' : 'Destination'}<select aria-label={ko ? '연결 유형' : 'Destination'} disabled={editing !== null} value={form.kind} onChange={(event) => change({ kind: event.target.value as SiteMenu['kind'] })}>
              <option value="board">{ko ? '게시판' : 'Board'}</option>
              <option value="page">{ko ? '기존 페이지' : 'Existing page'}</option>
            </select></label>
            {form.kind === 'board' ? <label>{ko ? '게시판 표시' : 'Board view'}<select aria-label={ko ? '게시판 표시' : 'Board view'} value={form.view} onChange={(event) => change({ view: event.target.value as SiteMenu['view'] })}>
              <option value="list">{ko ? '목록' : 'List'}</option>
              <option value="icons">{ko ? '아이콘' : 'Icons'}</option>
            </select></label> : <label>{ko ? '연결할 페이지' : 'Linked page'}<select aria-label={ko ? '연결할 페이지' : 'Linked page'} required value={form.postId ?? ''} onChange={(event) => change({ postId: Number(event.target.value) || null })} disabled={!targets}>
              <option value="">{targetError ? (ko ? '페이지 목록을 불러오지 못했습니다' : 'Could not load pages') : targets ? (ko ? '선택' : 'Select a page') : t(lang, 'common.loading')}</option>
              {form.postId && targets && !targets.some((post) => post.id === form.postId) && <option value={form.postId}>{ko ? '삭제된 페이지' : 'Deleted page'}</option>}
              {targets?.map((post) => <option key={post.id} value={post.id}>{post.title}{post.status === 'draft' ? (ko ? ' (초안)' : ' (draft)') : ''}</option>)}
            </select></label>}
            <label>{ko ? '표시 순서' : 'Order'}<input type="number" min={0} max={9999} required value={form.position} onChange={(event) => change({ position: event.target.valueAsNumber || 0 })} /></label>
          </fieldset>
          <div className="manager-actions">
            <button type="submit" className="workspace-button--primary" disabled={busy || (form.kind === 'page' && !targets)}>{busy ? t(lang, 'layout.saving') : (ko ? '저장' : 'Save')}</button>
            {editing !== null && <>
              <button type="button" disabled={busy || pending} onClick={() => choose(undefined, editing)}>{ko ? '하위 메뉴 추가' : 'Add submenu'}</button>
              <button type="button" className="workspace-danger" disabled={busy} onClick={() => void remove()}>{ko ? '메뉴 삭제' : 'Delete menu'}</button>
            </>}
          </div>
        </form> : <p className="workspace-muted manager-empty">{ko ? '메뉴를 선택하거나 새 메뉴를 추가하세요.' : 'Select a menu or add a new one.'}</p>}
      </div>
    </section>
  );
}
