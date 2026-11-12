import { Link } from 'react-router-dom';
import { pageHref } from '../lib/navigation';
import { t } from '../lib/site';
import type { PostItem, SiteLang } from '../types';

export function EntryCard({ post, lang, category, showDraftBadge = false }: {
  post: PostItem;
  lang: SiteLang;
  category?: string;
  showDraftBadge?: boolean;
}) {
  const size = post.card.titleSize === 'auto' ? 'compact' : post.card.titleSize;
  return (
    <article className="entry-card">
      <Link className="entry-card__link" to={pageHref(post)}>
        <div className="entry-card__media">
          <img className="entry-card__image" src={post.card.imageUrl || post.cover?.url || '/card-1.png'} alt="" loading="lazy" decoding="async" />
        </div>
        <div className="entry-card__info">
          <div className="home-card-meta"><span>{category}</span><span>{post.card.rankNumber}</span></div>
          <div className={`entry-card__title entry-card__title--${size}`}>
            {post.title}{showDraftBadge && post.status === 'draft' && <span className="entry-card__title--draft"> · {t(lang, 'card.draft')}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
