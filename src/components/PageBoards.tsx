import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { listPosts, type ListPostsParams } from '../lib/api';
import { editHref, menuHref, menuTrail, pageHref } from '../lib/navigation';
import { normalizeSection, sectionLabel, t } from '../lib/site';
import type { PostListResponse, SiteLang, SiteMenu, SiteSection } from '../types';
import { Breadcrumbs, useSiteNavigation } from './SiteNavigation';

const PAGE_SIZE = 24;

function usePages({ lang, menu, section, status = 'published', q = '', page = 1 }: ListPostsParams) {
  const [data, setData] = useState<PostListResponse>();
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    setPending(true);
    setError(false);
    listPosts({ lang, menu, section, status, q, page, limit: PAGE_SIZE }).then(
      (result) => { if (current) { setData(result); setPending(false); } },
      () => { if (current) { setData(undefined); setError(true); setPending(false); } }
    );
    return () => { current = false; };
  }, [lang, menu, section, status, q, page]);
  return { data, pending, error };
}

function Pager({ lang, page, total, onPage }: { lang: SiteLang; page: number; total: number; onPage: (page: number) => void }) {
  const count = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page === 1 && count === 1) return null;
  return (
    <nav className="workspace-pager" aria-label={lang === 'ko' ? '페이지 이동' : 'Pagination'}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{lang === 'ko' ? '이전' : 'Previous'}</button>
      <span>{page} / {count}</span>
      <button type="button" disabled={page >= count} onClick={() => onPage(page + 1)}>{lang === 'ko' ? '다음' : 'Next'}</button>
    </nav>
  );
}

function FileIcon({ folder = false }: { folder?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {folder ? <path d="M3 6h7l2 2h9v11H3z" /> : <path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6" />}
  </svg>;
}

function Board({ lang, menu, section }: { lang: SiteLang; menu?: SiteMenu; section?: SiteSection }) {
  const { menus, admin } = useSiteNavigation();
  const [page, setPage] = useState(1);
  const { data, pending, error } = usePages({ lang, menu: menu?.id, section, page });
  const children = menu ? menus.filter((item) => item.parentId === menu.id && menuHref(item, lang)) : [];
  const directlyLinked = new Set(children.map((item) => item.postId));
  const posts = data?.items.filter((post) => !directlyLinked.has(post.id)) ?? [];
  const title = menu?.label ?? sectionLabel(section!, lang);
  const view = menu?.view ?? 'icons';
  const ko = lang === 'ko';
  useEffect(() => { document.title = `${title} | GA-ML`; return () => { document.title = 'GA-ML'; }; }, [title]);

  return (
    <section className="workspace workspace--board">
      <Breadcrumbs lang={lang} menuId={menu?.id ?? null} title={menu ? undefined : title} />
      <header className="workspace-heading">
        <h1>{title}</h1>
        {admin && <Link className="workspace-button" to={`/${lang}/edit/new/${menu ? `?menu=${menu.id}` : ''}`}>{ko ? '페이지 만들기' : 'New page'}</Link>}
      </header>
      {error && <p role="alert">{ko ? '페이지를 불러오지 못했습니다. 새로고침해 주세요.' : 'Could not load pages. Refresh to try again.'}</p>}
      <ul className={`board-items board-items--${view}`} aria-busy={pending}>
        {children.map((child) => <li key={`menu-${child.id}`}><Link to={menuHref(child, lang)}>
          <span className="board-item-icon"><FileIcon folder={child.kind === 'board'} /></span>
          <span>{child.label}</span>
        </Link></li>)}
        {!pending && posts.map((post) => <li key={`page-${post.id}`}><Link to={pageHref(post)}>
          <span className="board-item-icon">{view === 'icons' && post.card.imageUrl
            ? <img src={post.card.imageUrl} alt="" loading="lazy" /> : <FileIcon />}</span>
          <span>{post.title}</span>
          {view === 'list' && <time dateTime={post.published_at || post.created_at}>{new Date(post.published_at || post.created_at).toLocaleDateString(lang)}</time>}
        </Link></li>)}
      </ul>
      {pending && <p role="status" className="workspace-muted">{t(lang, 'common.loading')}</p>}
      {!pending && !error && !children.length && !posts.length && <p className="workspace-muted">{ko ? '아직 공개된 페이지가 없습니다.' : 'No published pages here yet.'}</p>}
      {!pending && data && <Pager lang={lang} page={page} total={data.total} onPage={setPage} />}
    </section>
  );
}

export function BoardRoute({ lang, legacy = false }: { lang: SiteLang; legacy?: boolean }) {
  const { menus, pending, error } = useSiteNavigation();
  const { menuId, section: rawSection } = useParams();
  const section = legacy ? normalizeSection(rawSection) : null;
  const menu = legacy ? (section ? menus.find((item) => item.legacySection === section && item.kind === 'board') : undefined)
    : menus.find((item) => item.id === Number(menuId));
  if (pending && !menu) return <p className="workspace" role="status">{t(lang, 'common.loading')}</p>;
  if (legacy && menu) return <Navigate to={menuHref(menu, lang)} replace />;
  if (legacy && section) return <Board key={section} lang={lang} section={section} />;
  if (menu?.kind === 'board') return <Board key={menu.id} lang={lang} menu={menu} />;
  return <p className="workspace" role="status">{error
    ? (lang === 'ko' ? '메뉴를 불러오지 못했습니다.' : 'Could not load the menu.')
    : (lang === 'ko' ? '게시판을 찾을 수 없습니다.' : 'Board not found.')}</p>;
}

export function PageManager({ lang }: { lang: SiteLang }) {
  const { menus } = useSiteNavigation();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, pending, error } = usePages({ lang, q: search, status: 'all', page });
  const ko = lang === 'ko';
  return (
    <section className="workspace">
      <header className="workspace-heading">
        <h1>{ko ? '페이지 관리' : 'Pages'}</h1>
        <Link className="workspace-button workspace-button--primary" to={`/${lang}/edit/new/`}>{ko ? '페이지 만들기' : 'New page'}</Link>
      </header>
      <form className="workspace-search" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
        <input type="search" aria-label={ko ? '페이지 제목' : 'Page title'} placeholder={ko ? '페이지 제목 검색' : 'Search by title'} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit">{ko ? '검색' : 'Search'}</button>
      </form>
      {pending && <p role="status">{t(lang, 'common.loading')}</p>}
      {error && <p role="alert">{ko ? '페이지 목록을 불러오지 못했습니다.' : 'Could not load pages.'}</p>}
      {!pending && data && <>
        <ul className="manager-pages">
          {data.items.map((post) => <li key={post.id}>
            <div><Link to={editHref(post)}>{post.title}</Link><small>{menuTrail(menus, post.menuId).map((item) => item.label).join(' / ') || (ko ? '소속 메뉴 없음' : 'No board')}</small></div>
            <span className={`page-status page-status--${post.status}`}>{post.status === 'published' ? (ko ? '공개' : 'Published') : (ko ? '초안' : 'Draft')}</span>
            <Link className="workspace-button" to={pageHref(post)}>{ko ? '보기' : 'View'}</Link>
          </li>)}
        </ul>
        {!data.items.length && <p className="workspace-muted">{ko ? '조건에 맞는 페이지가 없습니다.' : 'No pages match this search.'}</p>}
        <Pager lang={lang} page={page} total={data.total} onPage={setPage} />
      </>}
    </section>
  );
}
