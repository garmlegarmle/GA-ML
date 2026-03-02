import { Link } from 'react-router-dom';
import { sectionLabel, t } from '../lib/site';
import type { PostItem, SiteLang } from '../types';

interface EntryCardProps {
  post: PostItem;
  href?: string;
  lang: SiteLang;
  showDraftBadge?: boolean;
}

function rankText(post: PostItem, fallback: number): string {
  if (post.card.rank) return post.card.rank;
  if (post.card.rankNumber) return `#${post.card.rankNumber}`;
  return `#${fallback}`;
}

function displayCategory(rawCategory: string | null | undefined, post: PostItem, lang: SiteLang): string {
  const raw = String(rawCategory || '').trim();
  const normalized = raw.toLowerCase();
  if (!raw) return sectionLabel(post.section, lang);

  if (normalized === 'blog') return sectionLabel('blog', lang);
  if (normalized === 'tool' || normalized === 'tools') return sectionLabel('tools', lang);
  if (normalized === 'game' || normalized === 'games') return sectionLabel('games', lang);
  if (normalized === 'page' || normalized === 'pages') return sectionLabel('pages', lang);
  return raw;
}

function displayTag(rawTag: string | null | undefined, tags: string[], lang: SiteLang): string {
  const raw = String(rawTag || '').trim();
  if (!raw) return tags[0] || t(lang, 'card.tagFallback');
  if (raw.toLowerCase() === 'tag') return t(lang, 'card.tagFallback');
  return raw;
}

export function EntryCard({ post, href, lang, showDraftBadge = false }: EntryCardProps) {
  const targetHref = href || `/${lang}/${post.section}/${post.slug}/`;
  const cardTitle = post.card.title || post.title;
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const titleClass = cardTitle.length >= 18 ? 'entry-card__title entry-card__title--compact' : 'entry-card__title';
  const rank = rankText(post, 1);
  const rankDigits = rank.replace(/\D/g, '').length;
  const rankClass = rankDigits >= 3 || rank.length >= 4 ? 'entry-card__rank entry-card__rank--compact' : 'entry-card__rank';
  const image = post.card.imageUrl || post.cover?.url || '';
  const categoryText = displayCategory(post.card.category, post, lang);
  const tagText = displayTag(post.card.tag, tags, lang);

  return (
    <article className="entry-card">
      <Link className="entry-card__link" to={targetHref}>
        <div className="entry-card__media">
          {image ? (
            <img className="entry-card__image" src={image} alt={cardTitle} loading="lazy" decoding="async" />
          ) : (
            <div className="entry-card__placeholder">{t(lang, 'card.placeholder')}</div>
          )}
        </div>
        <div className="entry-card__info">
          <p className="entry-card__meta">
            <span>{categoryText}</span>
            <span className="entry-card__meta-right">
              {showDraftBadge && post.status === 'draft' ? (
                <span className="entry-card__draft">{t(lang, 'card.draft')}</span>
              ) : null}
              <span>{tagText}</span>
            </span>
          </p>
          <p className="entry-card__title-row">
            <span className={titleClass}>{cardTitle}</span>
            <span className={rankClass}>{rank}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
