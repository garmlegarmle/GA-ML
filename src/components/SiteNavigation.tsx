import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { listMenus } from '../lib/api';
import { menuHref, menuTrail } from '../lib/navigation';
import { getLanguageTogglePath, t } from '../lib/site';
import type { SiteLang, SiteMenu } from '../types';

interface NavigationState {
  menus: SiteMenu[];
  pending: boolean;
  error: boolean;
  admin: boolean;
  refresh: () => void;
  login: () => void;
  logout: () => void;
  password: () => void;
}

const NavigationContext = createContext<NavigationState | null>(null);

export function NavigationProvider({ lang, admin, login, logout, password, children }: {
  lang: SiteLang;
  admin: boolean;
  login: () => void;
  logout: () => void;
  password: () => void;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<{ lang: SiteLang; admin: boolean; version: number; menus: SiteMenu[]; error: boolean }>();
  useEffect(() => {
    let current = true;
    listMenus(lang, admin).then(
      (menus) => { if (current) setData({ lang, admin, version, menus, error: false }); },
      () => { if (current) setData({ lang, admin, version, menus: [], error: true }); }
    );
    return () => { current = false; };
  }, [lang, admin, version]);
  const matching = data?.lang === lang && data.admin === admin;
  return (
    <NavigationContext.Provider value={{
      menus: matching ? data.menus : [],
      pending: !matching || data.version !== version,
      error: matching && data.error,
      admin, login, logout, password,
      refresh: () => setVersion((value) => value + 1)
    }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useSiteNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('NavigationProvider is missing');
  return value;
}

export function Breadcrumbs({ lang, menuId, title }: { lang: SiteLang; menuId: number | null; title?: string }) {
  const { menus } = useSiteNavigation();
  const trail = menuTrail(menus, menuId);
  if (!trail.length && !title) return null;
  const current = title ?? trail.at(-1)?.label;
  const ancestors = title ? trail : trail.slice(0, -1);
  return (
    <nav className="site-crumbs" aria-label={lang === 'ko' ? '탐색 경로' : 'Breadcrumb'}>
      <ol>
        <li><Link to={`/${lang}/`}>{t(lang, 'nav.home')}</Link></li>
        {ancestors.map((menu) => <li key={menu.id}>{menuHref(menu, lang) ? <Link to={menuHref(menu, lang)}>{menu.label}</Link> : menu.label}</li>)}
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}

export function SiteSidebar({ lang, activeMenuId, languageTogglePath, languageToggleState }: {
  lang: SiteLang;
  activeMenuId?: number | null;
  languageTogglePath?: string;
  languageToggleState?: { languageSwitch?: boolean; fallbackPath?: string } | null;
}) {
  const location = useLocation();
  const { menus, error, admin, refresh, login, logout, password } = useSiteNavigation();
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const ko = lang === 'ko';
  const path = location.pathname.replace(/\/$/, '');
  const explicit = Number(new URLSearchParams(location.search).get('menu'));
  const active = menus.find((menu) => menu.id === explicit && menu.postPath?.replace(/\/$/, '') === path) ??
    menus.find((menu) => (activeMenuId == null || menu.id === activeMenuId) && menuHref(menu, lang).split('?')[0].replace(/\/$/, '') === path);
  const currentBranch = new Set(menuTrail(menus, activeMenuId ?? active?.id ?? null).map((menu) => menu.id));
  const togglePath = languageTogglePath || (path.startsWith(`/${lang}/menu/`) || path.startsWith(`/${lang}/manage/`)
    ? `/${ko ? 'en' : 'ko'}/`
    : getLanguageTogglePath(location.pathname, lang));

  useEffect(() => { setExpanded(false); }, [location.key]);
  function renderMenus(parent: number | null): ReactNode {
    const entries = menus.filter((menu) => menu.parentId === parent);
    if (!entries.length) return null;
    return <ul className="sidebar-tree">{entries.map((menu) => {
      const to = menuHref(menu, lang);
      const children = renderMenus(menu.id);
      return (
        <li key={menu.id} className={currentBranch.has(menu.id) ? 'sidebar-branch' : undefined}>
          {to ? <Link to={to} aria-current={active?.id === menu.id ? 'page' : undefined}>{menu.label}</Link> : <span>{menu.label}</span>}
          {children}
        </li>
      );
    })}</ul>;
  }

  return (
    <aside className="site-sidebar" onKeyDown={(event) => {
      if (expanded && event.key === 'Escape') { setExpanded(false); toggleRef.current?.focus(); }
    }}>
      <a className="sidebar-skip" href="#main-content">{ko ? '본문으로 건너뛰기' : 'Skip to content'}</a>
      <div className="sidebar-head">
        <Link className="sidebar-brand" to={`/${lang}/`}>GA-ML</Link>
        <button ref={toggleRef} type="button" className="sidebar-toggle" aria-controls="sidebar-navigation" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={expanded ? 'M4 4l10 10M14 4L4 14' : 'M2 5h14M2 9h14M2 13h14'} /></svg>
          {expanded ? (ko ? '닫기' : 'Close') : (ko ? '메뉴' : 'Menu')}
        </button>
      </div>
      <div className={`sidebar-navigation${expanded ? ' is-expanded' : ''}`} id="sidebar-navigation">
        <nav aria-label={ko ? '주요 메뉴' : 'Primary navigation'}>
          <ul className="sidebar-tree">
            <li><Link aria-current={path === `/${lang}` ? 'page' : undefined} to={`/${lang}/`}>{t(lang, 'nav.home')}</Link></li>
          </ul>
          {renderMenus(null)}
          {error && <button className="sidebar-action" type="button" onClick={refresh}>{ko ? '메뉴 다시 불러오기' : 'Reload menu'}</button>}
        </nav>
        <div className="sidebar-utilities">
          {admin && <details className="sidebar-admin" open={path.startsWith(`/${lang}/manage/`) || undefined}>
            <summary>{ko ? '관리자' : 'Admin'}</summary>
            <Link to={`/${lang}/edit/new/`}>{ko ? '페이지 만들기' : 'New page'}</Link>
            <Link to={`/${lang}/manage/pages/`}>{ko ? '페이지 관리' : 'Pages'}</Link>
            <Link to={`/${lang}/manage/menus/`}>{ko ? '메뉴 관리' : 'Menus'}</Link>
            <button className="sidebar-action" type="button" onClick={password}>{t(lang, 'admin.changePassword')}</button>
            <button className="sidebar-action" type="button" onClick={logout}>{t(lang, 'admin.logout')}</button>
          </details>}
          {!admin && new URLSearchParams(location.search).get('admin') === '8722' &&
            <button type="button" className="sidebar-action" onClick={login}>{t(lang, 'admin.login')}</button>}
          <Link className="sidebar-language" to={togglePath} state={languageToggleState || undefined} rel="alternate" hrefLang={ko ? 'en' : 'ko'}>
            {ko ? 'English' : '한국어'}
          </Link>
        </div>
      </div>
    </aside>
  );
}
