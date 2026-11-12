import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { PostItem, PostLayoutBlock } from '../types';

export function renderRichContent(raw: string | null | undefined): string {
  if (!raw) return '';

  const value = String(raw || '');
  if (/<[a-z][\s\S]*>/i.test(value)) {
    return DOMPurify.sanitize(value);
  }

  const parsed = marked.parse(value, { async: false }) as string;
  return DOMPurify.sanitize(parsed);
}

function sortLayoutBlocksForSingleFlow(blocks: PostLayoutBlock[] | null | undefined) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block.visible !== false)
    .sort((left, right) => {
      if (left.column !== right.column) {
        return left.column === 'left' ? -1 : 1;
      }
      return Number(left.order || 0) - Number(right.order || 0);
    });
}

export function resolveLinearBodySource(post: Pick<PostItem, 'content_md' | 'content_before_md' | 'content_after_md' | 'layout_blocks'> | null | undefined) {
  const direct = String(post?.content_md || '').trim();
  if (direct) return direct;

  const fromBlocks = sortLayoutBlocksForSingleFlow(post?.layout_blocks)
    .filter((block) => block.type === 'text')
    .map((block) => String(block.html || '').trim())
    .filter(Boolean)
    .join('\n');
  if (fromBlocks) return fromBlocks;

  const before = String(post?.content_before_md || '').trim();
  const after = String(post?.content_after_md || '').trim();
  return [before, after].filter(Boolean).join('\n');
}
