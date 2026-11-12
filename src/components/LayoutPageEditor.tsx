import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getPostBySlug } from '../lib/api';
import { menuHref, pageHref } from '../lib/navigation';
import { normalizeSection, t } from '../lib/site';
import type { PostItem, SiteLang } from '../types';
import { BodyLayoutEditor } from './BodyLayoutEditor';
import { useSiteNavigation } from './SiteNavigation';

export function LayoutPageEditor({ lang }: { lang: SiteLang }) {
  const { section, slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { menus, pending: menusPending, refresh } = useSiteNavigation();
  const [post, setPost] = useState<PostItem>();
  const [pending, setPending] = useState(Boolean(slug));
  const [error, setError] = useState(false);
  const ko = lang === 'ko';
  const manage = `/${lang}/manage/pages/`;
  const board = menus.find((item) => item.kind === 'board' && item.id === Number(new URLSearchParams(location.search).get('menu')));
  const back = post ? pageHref(post) : board ? menuHref(board, lang) : manage;

  useEffect(() => {
    document.title = `${ko ? '페이지 편집' : 'Page editor'} | GA-ML`;
    return () => { document.title = 'GA-ML'; };
  }, [ko]);

  useEffect(() => {
    if (!slug) return;
    const currentSection = normalizeSection(section);
    if (!currentSection) { setError(true); setPending(false); return; }
    let current = true;
    getPostBySlug(slug, lang, currentSection).then(
      ({ post }) => { if (current) { setPost(post); setPending(false); } },
      () => { if (current) { setError(true); setPending(false); } }
    );
    return () => { current = false; };
  }, [lang, section, slug]);

  if (pending || menusPending) return <p className="workspace" role="status">{t(lang, 'common.loading')}</p>;
  if (error) return <div className="workspace">
    <p role="alert">{ko ? '편집할 페이지를 불러오지 못했습니다.' : 'Could not load the page.'}</p>
    <Link to={manage}>{ko ? '페이지 관리' : 'Pages'}</Link>
  </div>;
  return (
    <BodyLayoutEditor
      lang={lang} post={post ?? null} initialMenuId={board?.id ?? null}
      onExit={() => navigate(back, { replace: true })}
      onSaved={(page) => { refresh(); navigate(pageHref(page), { replace: true }); }}
      onDeleted={() => { refresh(); navigate(manage, { replace: true }); }}
    />
  );
}
