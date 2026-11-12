import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Navigate, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { renderRichContent, resolveLinearBodySource } from './lib/pageBody';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AdminPasswordModal } from './components/AdminPasswordModal';
import { BodyLayoutRenderer } from './components/BodyLayoutRenderer';
import { EntryCard } from './components/EntryCard';
import { PagedRichColumn, type PagedRichColumnSegment } from './components/PagedRichColumn';
import { SiteSidebar, NavigationProvider, useSiteNavigation, Breadcrumbs } from './components/SiteNavigation';
import { BoardRoute, PageManager } from './components/PageBoards';
import { MenuManager } from './components/MenuManager';
import { LayoutPageEditor } from './components/LayoutPageEditor';
import { editHref, menuTrail } from './lib/navigation';
import { SiteFooter } from './components/SiteFooter';
import { trackPageView } from './lib/analytics';
import { changeAdminPassword, getPostBySlug, getSession, listPosts, login, logout } from './lib/api';
import {
  CHART_INTERPRETATION_TOOL_SLUG,
  MINE_CART_DUEL_SLUG,
  TEXAS_HOLDEM_TOURNAMENT_SLUG,
  TREND_ANALYZER_TOOL_SLUG
} from './lib/postSlugs';
import { detectBrowserLang, normalizeLang, normalizeSection, t } from './lib/site';
import type { PostItem, SiteLang, SiteSection } from './types';

interface AdminState {
  loading: boolean;
  isAdmin: boolean;
  username: string | null;
}

interface LanguageToggleState {
  languageSwitch?: boolean;
  fallbackPath?: string;
}

type PostSortOrder = 'desc' | 'asc';

const LazyChartInterpretationToolContent = lazy(() =>
  import('./components/ChartInterpretationTool').then((module) => ({ default: module.ChartInterpretationToolContent }))
);
const LazyTrendAnalyzerToolContent = lazy(() =>
  import('./components/TrendAnalyzerTool').then((module) => ({ default: module.TrendAnalyzerToolContent }))
);
const LazyHoldemTournamentGameContent = lazy(() =>
  import('./components/HoldemTournamentGame').then((module) => ({ default: module.HoldemTournamentGameContent }))
);
const LazyHandShooterGameContent = lazy(() =>
  import('./components/HandShooterGame').then((module) => ({ default: module.HandShooterGameContent }))
);

function resolveColumnSources(post: Pick<PostItem, 'content_md' | 'content_before_md' | 'content_after_md'> | null | undefined) {
  const leftSource = String(post?.content_before_md || '').trim();
  const rightSource = String(post?.content_after_md || '').trim();

  if (leftSource || rightSource) {
    return { leftSource, rightSource };
  }

  return {
    leftSource: String(post?.content_md || '').trim(),
    rightSource: ''
  };
}

function toPagedSegmentsFromHtml(html: string | null | undefined, key: string): PagedRichColumnSegment[] {
  const value = String(html || '').trim();
  return value ? [{ key, html: value }] : [];
}

function postDateValue(post: Pick<PostItem, 'published_at' | 'created_at'>): number {
  const raw = post.published_at || post.created_at;
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

function postRankValue(post: PostItem): number | null {
  const value = post.card?.rankNumber;
  return Number.isFinite(value) ? Number(value) : null;
}

function sortPostsByCardRank(list: PostItem[], order: PostSortOrder): PostItem[] {
  return [...list].sort((a, b) => {
    const leftRank = postRankValue(a);
    const rightRank = postRankValue(b);

    if (leftRank !== null || rightRank !== null) {
      if (leftRank === null) return 1;
      if (rightRank === null) return -1;
      const rankDiff = order === 'desc' ? rightRank - leftRank : leftRank - rightRank;
      if (rankDiff !== 0) return rankDiff;
    }

    const dateDiff = postDateValue(b) - postDateValue(a);
    if (dateDiff !== 0) return dateDiff;
    return b.id - a.id;
  });
}

const VIEW_COUNT_EXCLUDED_PAGE_SLUGS = new Set(['about', 'contact', 'privacy-policy']);

function shouldShowViewCount(post: Pick<PostItem, 'section' | 'slug'>): boolean {
  return !(post.section === 'pages' && VIEW_COUNT_EXCLUDED_PAGE_SLUGS.has(post.slug));
}

function formatViewCount(value: number, lang: SiteLang): string {
  return new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-US').format(Math.max(0, Number(value || 0)));
}

function oppositeLang(lang: SiteLang): SiteLang {
  return lang === 'ko' ? 'en' : 'ko';
}

function buildSectionFallbackPath(lang: SiteLang, section: SiteSection | null): string {
  if (!section || section === 'pages') return `/${lang}/`;
  return `/${lang}/${section}/`;
}

function buildDetailLanguageToggle(
  lang: SiteLang,
  section: SiteSection | null,
  slug: string,
  pairSlug: string | null | undefined
): { path: string; state: LanguageToggleState } {
  const targetLang = oppositeLang(lang);
  const fallbackPath = buildSectionFallbackPath(targetLang, section);
  const targetSlug = String(pairSlug || slug || '').trim();

  if (!section || !targetSlug) {
    return {
      path: fallbackPath,
      state: { languageSwitch: true, fallbackPath }
    };
  }

  return {
    path: `/${targetLang}/${section}/${targetSlug}/`,
    state: { languageSwitch: true, fallbackPath }
  };
}

function renderTitleWithHiddenLoginTrigger(
  title: string,
  enabled: boolean,
  onTrigger: () => void
): React.ReactNode {
  if (!enabled) return title;

  const chars = [...title];
  let injected = false;

  return chars.map((char, index) => {
    if (!injected && /o/i.test(char)) {
      injected = true;
      return (
        <button
          key={`hidden-login-${index}`}
          type="button"
          className="hidden-admin-letter"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onTrigger();
          }}
          tabIndex={-1}
          aria-label="Admin login"
        >
          {char}
        </button>
      );
    }

    return <span key={`title-char-${index}`}>{char}</span>;
  });
}

function useAdminSession() {
  const [state, setState] = useState<AdminState>({ loading: true, isAdmin: false, username: null });

  const refresh = useCallback(async () => {
    try {
      const session = await getSession();
      setState({
        loading: false,
        isAdmin: Boolean(session.authenticated && session.isAdmin),
        username: session.username
      });
    } catch {
      setState({ loading: false, isAdmin: false, username: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}

function SiteShell({ lang, activeMenuId, languageTogglePath, languageToggleState, children }: {
  lang: SiteLang;
  activeMenuId?: number | null;
  languageTogglePath?: string;
  languageToggleState?: LanguageToggleState | null;
  children: React.ReactNode;
}) {
  return (
    <div className="site-shell site-shell--sidebar">
      <SiteSidebar lang={lang} activeMenuId={activeMenuId} languageTogglePath={languageTogglePath} languageToggleState={languageToggleState} />
      <div className="site-main-column">
        <main id="main-content" tabIndex={-1}>{children}</main>
        <SiteFooter lang={lang} />
      </div>
    </div>
  );
}

function RootRoute() {
  return <Navigate to={`/${detectBrowserLang()}/`} replace />;
}

function HomePage({ lang }: { lang: SiteLang }) {
  const { menus, admin } = useSiteNavigation();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [order, setOrder] = useState<PostSortOrder>('desc');
  useEffect(() => {
    let current = true;
    async function load() {
      const items: PostItem[] = [];
      let page = 1;
      while (current) {
        const response = await listPosts({ lang, feed: true, status: admin ? 'all' : 'published', page, limit: 50 });
        items.push(...response.items);
        if (items.length >= response.total || !response.items.length) break;
        page++;
      }
      if (current) { setPosts(items); setPending(false); }
    }
    setPending(true); setError(false); setPosts([]);
    load().catch(() => { if (current) { setError(true); setPending(false); } });
    return () => { current = false; };
  }, [lang, admin]);

  const paths = new Map(posts.map((post) => {
    const linked = menus.find((menu) => menu.postId === post.id);
    return [post.id, menuTrail(menus, post.menuId ?? linked?.id ?? null)];
  }));
  const categories = menus.filter((menu) => menu.kind === 'board' && !menuTrail(menus, menu.parentId).some((parent) => parent.kind === 'board'));
  const current = categories.some((menu) => menu.id === selected) ? selected : null;
  const visible = sortPostsByCardRank(current === null ? posts : posts.filter((post) =>
    paths.get(post.id)?.some((menu) => menu.id === current)
  ), order);

  return (
    <SiteShell lang={lang}>
      <section className="page-section home-feed">
        <div className="container">
          <header className="home-feed__filters">
            <div className="home-feed__categories" aria-label={t(lang, 'home.category')}>
              <button type="button" aria-pressed={current === null} onClick={() => setSelected(null)}>{t(lang, 'common.all')} ({posts.length})</button>
              {categories.map((menu) => <button key={menu.id} type="button" aria-pressed={current === menu.id} onClick={() => setSelected(menu.id)}>
                {menu.label} ({posts.filter((post) => paths.get(post.id)?.some((entry) => entry.id === menu.id)).length})
              </button>)}
            </div>
            <label className="list-head__sort-label">
              <span>{t(lang, 'common.sort')}</span>
              <select className="list-head__sort-select" value={order} onChange={(event) => setOrder(event.target.value as PostSortOrder)}>
                <option value="desc">{t(lang, 'common.descending')}</option>
                <option value="asc">{t(lang, 'common.ascending')}</option>
              </select>
            </label>
          </header>
          {pending && <p role="status">{t(lang, 'common.loading')}</p>}
          {error && <p role="alert">{lang === 'ko' ? '첫 화면의 페이지를 불러오지 못했습니다.' : 'Could not load the home feed.'}</p>}
          <div className="listing-grid listing-grid--four listing-grid--center">
            {visible.map((post) => <EntryCard key={post.id} post={post} lang={lang} category={paths.get(post.id)?.at(-1)?.label} showDraftBadge={admin} />)}
          </div>
          {!pending && !error && !visible.length && <p className="workspace-muted">{t(lang, 'common.noPosts')}</p>}
        </div>
      </section>
    </SiteShell>
  );
}

function DetailPage() {
  const { admin, menus, login: requestAdmin } = useSiteNavigation();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const lang = normalizeLang(params.lang);
  const section = normalizeSection(params.section || '') as SiteSection | null;
  const slug = String(params.slug || '');
  const isValidSection = Boolean(section);

  const [post, setPost] = useState<PostItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const languageToggle = useMemo(
    () => buildDetailLanguageToggle(lang, section, slug, post?.pair_slug),
    [lang, post?.pair_slug, section, slug]
  );
  const locationState = location.state as LanguageToggleState | null;
  const languageSwitchFallback =
    locationState?.languageSwitch && locationState.fallbackPath ? locationState.fallbackPath : null;

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError('');

    async function load() {
      if (!isValidSection || !section) {
        setPost(null);
        setLoading(false);
        return;
      }

      try {
        const response = await getPostBySlug(slug, lang, section);
        if (canceled) return;
        setPost(response.post);
      } catch (err) {
        if (canceled) return;
        const message = err instanceof Error ? err.message : 'Failed to load post';
        if (message === 'Post not found' && languageSwitchFallback) {
          navigate(languageSwitchFallback, { replace: true });
          return;
        }
        setPost(null);
        setError(message);
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    void load();
    return () => {
      canceled = true;
    };
  }, [admin, isValidSection, lang, languageSwitchFallback, navigate, section, slug]);

  useEffect(() => {
    if (!post) return;
    document.title = `${post.title} | GA-ML`;
    return () => { document.title = 'GA-ML'; };
  }, [post?.title]);

  const linearBodyHtml = useMemo(
    () => renderRichContent(resolveLinearBodySource(post)),
    [post?.content_after_md, post?.content_before_md, post?.content_md, post?.layout_blocks]
  );

  const enableHiddenPolicyLogin =
    section === 'pages' && lang === 'en' && slug === 'privacy-policy' && !admin;
  const isStandalonePage = section === 'pages';
  const isChartInterpretationTool = section === 'tools' && slug === CHART_INTERPRETATION_TOOL_SLUG;
  const isTrendAnalyzerTool = section === 'tools' && slug === TREND_ANALYZER_TOOL_SLUG;
  const isHoldemTournamentGame = section === 'games' && slug === TEXAS_HOLDEM_TOURNAMENT_SLUG;
  const isMineCartDuelGame = section === 'games' && slug === MINE_CART_DUEL_SLUG;
  const isEmbeddedProgramPost = isChartInterpretationTool || isTrendAnalyzerTool || isHoldemTournamentGame || isMineCartDuelGame;
  const columnSources = useMemo(() => resolveColumnSources(post), [post?.content_after_md, post?.content_before_md, post?.content_md]);
  const leftColumnHtml = useMemo(() => renderRichContent(columnSources.leftSource), [columnSources.leftSource]);
  const rightColumnHtml = useMemo(() => renderRichContent(columnSources.rightSource), [columnSources.rightSource]);
  const usesPagedDetailFlow = Boolean((section === 'blog' || section === 'pages') && linearBodyHtml);
  const pagedSegments = useMemo(
    () => (usesPagedDetailFlow ? toPagedSegmentsFromHtml(linearBodyHtml, `post-${post?.id ?? 'content'}`) : []),
    [linearBodyHtml, post?.id, usesPagedDetailFlow]
  );
  const loadingCopy = t(lang, 'common.loading');
  function renderProgramLoadingFallback() {
    return <div className="detail-program__placeholder">{loadingCopy}</div>;
  }

  function renderEmbeddedProgramSection(
    content: ReactElement,
    variant: 'tool' | 'game',
    label: string,
    key?: string
  ) {
    return (
      <section key={key} className={`detail-program detail-program--${variant}`} aria-label={label}>
        <Suspense fallback={renderProgramLoadingFallback()}>{content}</Suspense>
      </section>
    );
  }

  function renderToolSections() {
    const toolLayout = post?.tool_layout;
    const enabledSections = toolLayout?.sections?.filter((toolSection) => toolSection.enabled) || [];
    if (!enabledSections.length) {
      return (
        <section className="detail-program" aria-label="Program area">
          {post?.cover?.url ? (
            <img src={post.cover.url} alt={post.title} loading="lazy" decoding="async" />
          ) : (
            <div className="detail-program__placeholder">
              {lang === 'ko' ? '도구 / 게임 영역' : 'Tool / Game Area'}
            </div>
          )}
        </section>
      );
    }

    return (
      <>
        {enabledSections.map((toolSection) => {
          if (toolSection.layout === 'two-col') {
            return (
              <div key={toolSection.id} className="tool-section tool-section--two-col">
                {toolSection.slots.map((slot, index) => (
                  <div key={index} className="tool-section__slot">
                    {slot.type === 'program' ? (
                      post?.cover?.url ? (
                        <img src={post.cover.url} alt={post.title} loading="lazy" decoding="async" className="tool-section__cover" />
                      ) : (
                        <div className="detail-program__placeholder">
                          {lang === 'ko' ? '도구 / 게임 영역' : 'Tool / Game Area'}
                        </div>
                      )
                    ) : (
                      <div
                        className="content-prose tool-section__text"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(slot.content || '') }}
                      />
                    )}
                  </div>
                ))}
              </div>
            );
          }

          const slot = toolSection.slots[0];
          if (!slot) return null;
          return (
            <div key={toolSection.id} className="tool-section tool-section--full">
              {slot.type === 'program' ? (
                <section className="detail-program" aria-label="Program area">
                  {post?.cover?.url ? (
                    <img src={post.cover.url} alt={post.title} loading="lazy" decoding="async" />
                  ) : (
                    <div className="detail-program__placeholder">
                      {lang === 'ko' ? '도구 / 게임 영역' : 'Tool / Game Area'}
                    </div>
                  )}
                </section>
              ) : (
                <div
                  className="content-prose tool-section__text"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(slot.content || '') }}
                />
              )}
            </div>
          );
        })}
      </>
    );
  }

  function renderProgram() {
    return isChartInterpretationTool ? (
      renderEmbeddedProgramSection(<LazyChartInterpretationToolContent lang={lang} embedded />, 'tool', 'Tool area')
    ) : isTrendAnalyzerTool ? (
      renderEmbeddedProgramSection(<LazyTrendAnalyzerToolContent lang={lang} embedded />, 'tool', 'Tool area')
    ) : isHoldemTournamentGame ? (
      renderEmbeddedProgramSection(<LazyHoldemTournamentGameContent lang={lang} embedded />, 'game', 'Game area')
    ) : isMineCartDuelGame ? (
      renderEmbeddedProgramSection(<LazyHandShooterGameContent lang={lang} embedded />, 'game', 'Game area')
    ) : section === 'tools' ? renderToolSections() : section === 'games' ? (
      <section className="detail-program" aria-label="Program area">
        {post?.cover?.url && <img src={post.cover.url} alt={post.title} loading="lazy" decoding="async" />}
      </section>
    ) : null;
  }

  function renderDetailBody() {
    if (post?.body_layout_json) {
      return (
        <div className="detail-layout__flow detail-layout__flow--layout-renderer">
          <BodyLayoutRenderer layout={post.body_layout_json} />
          {renderProgram()}
        </div>
      );
    }

    if (usesPagedDetailFlow) {
      return <PagedRichColumn className="detail-layout__flow" segments={pagedSegments} />;
    }

    if (isEmbeddedProgramPost) {
      return (
        <div className="detail-layout__flow">
          {leftColumnHtml ? (
            <section className="detail-layout__content content-prose" dangerouslySetInnerHTML={{ __html: leftColumnHtml }} />
          ) : null}

          {renderProgram()}

          {rightColumnHtml ? (
            <section className="detail-layout__content content-prose" dangerouslySetInnerHTML={{ __html: rightColumnHtml }} />
          ) : null}
        </div>
      );
    }

    if (section === 'tools') {
      return (
        <div className="detail-layout__flow">
          {leftColumnHtml ? (
            <section className="detail-layout__content content-prose" dangerouslySetInnerHTML={{ __html: leftColumnHtml }} />
          ) : null}
          {renderToolSections()}
          {rightColumnHtml ? (
            <section className="detail-layout__content content-prose" dangerouslySetInnerHTML={{ __html: rightColumnHtml }} />
          ) : null}
        </div>
      );
    }

    if (section === 'games') {
      return (
        <div className="detail-layout__flow">
          <section className="detail-program" aria-label="Program area">
            {post?.cover?.url ? (
              <img src={post.cover.url} alt={post.title} loading="lazy" decoding="async" />
            ) : (
              <div className="detail-program__placeholder">
                {lang === 'ko' ? '도구 / 게임 영역' : 'Tool / Game Area'}
              </div>
            )}
          </section>
          {linearBodyHtml ? (
            <section className="detail-layout__content content-prose" dangerouslySetInnerHTML={{ __html: linearBodyHtml }} />
          ) : null}
        </div>
      );
    }

    return linearBodyHtml ? (
      <div className="detail-layout__flow">
        <section className="detail-layout__content content-prose" dangerouslySetInnerHTML={{ __html: linearBodyHtml }} />
      </div>
    ) : null;
  }

  if (!isValidSection || !section) return <Navigate to={`/${lang}/`} replace />;
  const linkedMenus = post ? menus.filter((menu) => menu.postId === post.id) : [];
  const linkId = Number(new URLSearchParams(location.search).get('menu'));
  const linked = linkedMenus.find((menu) => menu.id === linkId) ?? (post?.menuId ? undefined : linkedMenus[0]);
  const categoryId = linked?.id ?? post?.menuId ?? null;

  return (
    <SiteShell lang={lang} activeMenuId={categoryId} languageTogglePath={languageToggle.path} languageToggleState={languageToggle.state}>
      <article className="page-section">
        <div className={`container detail-layout${usesPagedDetailFlow ? ' detail-layout--paged' : ''}`}>
          {loading && <p role="status">{t(lang, 'common.loading')}</p>}
          {error && <p role="alert">{error === 'Post not found' ? (lang === 'ko' ? '페이지를 찾을 수 없습니다.' : 'Page not found.') : error}</p>}
          {!loading && !error && post && <>
            <Breadcrumbs lang={lang} menuId={categoryId} title={linked ? undefined : post.title} />
            <header className="detail-layout__head">
              {!isStandalonePage && <p className="detail-layout__date">
                {t(lang, 'detail.created')}: {new Date(post.created_at).toLocaleDateString(lang)}
                {shouldShowViewCount(post) ? ` | ${t(lang, 'detail.views')}: ${formatViewCount(post.view_count, lang)}` : ''}
              </p>}
              <div className="detail-layout__title-row detail-layout__title-row--editable">
                <h1>{renderTitleWithHiddenLoginTrigger(post.title, enableHiddenPolicyLogin, requestAdmin)}</h1>
                {admin && <Link className="workspace-button" to={editHref(post)}>{lang === 'ko' ? '페이지 편집' : 'Edit page'}</Link>}
              </div>
            </header>
            {renderDetailBody()}
          </>}
        </div>
      </article>
    </SiteShell>
  );
}

function AppInner() {
  const location = useLocation();
  const { state: admin, refresh } = useAdminSession();
  const hasTrackedInitialPageView = useRef(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const currentLang = normalizeLang(location.pathname.split('/')[1]);

  useEffect(() => { document.documentElement.lang = currentLang; }, [currentLang]);
  useEffect(() => { if (!location.hash) window.scrollTo(0, 0); }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!hasTrackedInitialPageView.current) {
      hasTrackedInitialPageView.current = true;
      return;
    }
    trackPageView(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);

  const requestAdmin = () => setLoginOpen(true);
  function adminOnly(content: React.ReactNode) {
    if (admin.isAdmin) return content;
    return <SiteShell lang={currentLang}>
      <section className="workspace">
        {admin.loading ? <p role="status">{t(currentLang, 'common.loading')}</p> : <>
          <h1>{currentLang === 'ko' ? '관리자 전용' : 'Admin only'}</h1>
          <button type="button" onClick={requestAdmin}>{t(currentLang, 'admin.login')}</button>
        </>}
      </section>
    </SiteShell>;
  }

  return (
    <NavigationProvider
      lang={currentLang} admin={admin.isAdmin} login={requestAdmin}
      password={() => setPasswordOpen(true)}
      logout={() => { void logout().then(refresh).catch(() => window.alert(currentLang === 'ko' ? '로그아웃하지 못했습니다.' : 'Could not sign out.')); }}
    >
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/:lang" element={<HomePage key={currentLang} lang={currentLang} />} />
        <Route path="/:lang/menu/:menuId" element={<SiteShell lang={currentLang}><BoardRoute lang={currentLang} /></SiteShell>} />
        <Route path="/:lang/manage/menus" element={adminOnly(<SiteShell lang={currentLang}><MenuManager key={currentLang} lang={currentLang} /></SiteShell>)} />
        <Route path="/:lang/manage/pages" element={adminOnly(<SiteShell lang={currentLang}><PageManager key={currentLang} lang={currentLang} /></SiteShell>)} />
        <Route path="/:lang/edit/new" element={adminOnly(<LayoutPageEditor key={location.pathname} lang={currentLang} />)} />
        <Route path="/:lang/edit/:section/:slug" element={adminOnly(<LayoutPageEditor key={location.pathname} lang={currentLang} />)} />
        <Route path="/:lang/:section" element={<SiteShell lang={currentLang}><BoardRoute lang={currentLang} legacy /></SiteShell>} />
        <Route path="/:lang/:section/:slug" element={<DetailPage key={location.pathname} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AdminLoginModal open={loginOpen} lang={currentLang} onClose={() => setLoginOpen(false)} onSubmit={async (username, password) => {
        await login(username, password);
        await refresh();
      }} />
      <AdminPasswordModal open={passwordOpen} lang={currentLang} onClose={() => setPasswordOpen(false)} onSubmit={async (currentPassword, newPassword) => {
        await changeAdminPassword(currentPassword, newPassword);
      }} />
    </NavigationProvider>
  );
}

export default function App() {
  return <AppInner />;
}
