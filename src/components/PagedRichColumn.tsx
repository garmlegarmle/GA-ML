import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

const PAGE_RATIO = 29.7 / 21;
const MAX_INLINE_MARGIN = 100;
const MIN_INLINE_MARGIN = 24;
const MIN_CONTENT_WIDTH = 260;
const MAX_BLOCK_MARGIN = 40;
const MIN_BLOCK_MARGIN = 24;
const PAGE_SIZE_EPSILON = 1;

export interface PagedRichColumnSegment {
  key: string;
  html: string;
}

interface PagedRichColumnProps {
  className?: string;
  segments: PagedRichColumnSegment[];
}

interface PageMetrics {
  pageWidth: number;
  pageHeight: number;
  inlineMargin: number;
  blockMargin: number;
  contentWidth: number;
  contentHeight: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPageMetrics(pageWidth: number): PageMetrics {
  const safeWidth = Math.max(pageWidth, 0);
  const pageHeight = safeWidth * PAGE_RATIO;
  const inlineMargin = Math.min(MAX_INLINE_MARGIN, Math.max(MIN_INLINE_MARGIN, Math.floor((safeWidth - MIN_CONTENT_WIDTH) / 2)));
  const blockMargin = Math.min(MAX_BLOCK_MARGIN, Math.max(MIN_BLOCK_MARGIN, Math.floor(pageHeight * 0.05)));
  return {
    pageWidth: safeWidth,
    pageHeight,
    inlineMargin,
    blockMargin,
    contentWidth: Math.max(safeWidth - inlineMargin * 2, 0),
    contentHeight: Math.max(pageHeight - blockMargin * 2, 0)
  };
}

function splitHtmlIntoFragments(html: string, keyPrefix: string): PagedRichColumnSegment[] {
  const value = String(html || '').trim();
  if (!value) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(value, 'text/html');
  doc.querySelectorAll('script, style').forEach((node) => node.remove());

  const fragments = Array.from(doc.body.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() || '';
        return text ? `<p>${escapeHtml(text)}</p>` : '';
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as Element).outerHTML;
      }
      return '';
    })
    .filter(Boolean);

  if (fragments.length === 0) {
    return [{ key: `${keyPrefix}-0`, html: value }];
  }

  return fragments.map((fragment, index) => ({
    key: `${keyPrefix}-${index}`,
    html: fragment
  }));
}

function buildPageGroups(fragmentHeights: number[], pageContentHeight: number): number[][] {
  if (fragmentHeights.length === 0) return [];

  const groups: number[][] = [];
  let currentPage: number[] = [];
  let currentHeight = 0;

  fragmentHeights.forEach((height, index) => {
    const normalizedHeight = Math.max(height, 0);
    const exceedsCurrentPage = currentPage.length > 0 && currentHeight + normalizedHeight > pageContentHeight + PAGE_SIZE_EPSILON;

    if (exceedsCurrentPage) {
      groups.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }

    currentPage.push(index);
    currentHeight += normalizedHeight;
  });

  if (currentPage.length > 0) {
    groups.push(currentPage);
  }

  return groups;
}

function arePageGroupsEqual(left: number[][], right: number[][]): boolean {
  if (left.length !== right.length) return false;
  for (let pageIndex = 0; pageIndex < left.length; pageIndex += 1) {
    const leftPage = left[pageIndex];
    const rightPage = right[pageIndex];
    if (leftPage.length !== rightPage.length) return false;
    for (let itemIndex = 0; itemIndex < leftPage.length; itemIndex += 1) {
      if (leftPage[itemIndex] !== rightPage[itemIndex]) return false;
    }
  }
  return true;
}

export function PagedRichColumn({ className = '', segments }: PagedRichColumnProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageGroups, setPageGroups] = useState<number[][]>([]);

  const fragments = useMemo(
    () =>
      segments.flatMap((segment, index) =>
        splitHtmlIntoFragments(segment.html, segment.key || `segment-${index}`)
      ),
    [segments]
  );

  const metrics = useMemo(() => getPageMetrics(pageWidth), [pageWidth]);
  const fallbackGroups = useMemo(
    () => (fragments.length > 0 ? [fragments.map((_, index) => index)] : []),
    [fragments]
  );
  const visibleGroups = pageGroups.length > 0 ? pageGroups : fallbackGroups;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateWidth = () => {
      const nextWidth = Math.round(host.getBoundingClientRect().width * 100) / 100;
      setPageWidth((current) => (Math.abs(current - nextWidth) < PAGE_SIZE_EPSILON ? current : nextWidth));
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const measureNode = measureRef.current;
    if (!measureNode || fragments.length === 0 || metrics.contentHeight <= 0 || metrics.contentWidth <= 0) {
      setPageGroups((current) => (current.length > 0 ? [] : current));
      return;
    }

    const fragmentHeights = Array.from(measureNode.children).map((node) => {
      const element = node as HTMLElement;
      return Math.round(element.getBoundingClientRect().height * 100) / 100;
    });

    const nextGroups = buildPageGroups(fragmentHeights, metrics.contentHeight);
    setPageGroups((current) => (arePageGroupsEqual(current, nextGroups) ? current : nextGroups));
  }, [fragments, metrics.contentHeight, metrics.contentWidth]);

  const pageStyle = useMemo(
    () =>
      ({
        '--detail-page-height': `${metrics.pageHeight}px`,
        '--detail-page-inline-padding': `${metrics.inlineMargin}px`,
        '--detail-page-block-padding': `${metrics.blockMargin}px`
      }) as CSSProperties,
    [metrics.blockMargin, metrics.inlineMargin, metrics.pageHeight]
  );

  const measureStyle = useMemo(
    () =>
      ({
        width: `${metrics.contentWidth}px`
      }) as CSSProperties,
    [metrics.contentWidth]
  );

  return (
    <div ref={hostRef} className={`detail-layout__column detail-layout__column--paged ${className}`.trim()} style={pageStyle}>
      {visibleGroups.map((group, pageIndex) => (
        <section key={`page-${pageIndex}`} className="detail-layout__page">
          <div className="detail-layout__page-body content-prose">
            {group.map((fragmentIndex) => (
              <div
                key={fragments[fragmentIndex].key}
                className="detail-layout__page-fragment"
                dangerouslySetInnerHTML={{ __html: fragments[fragmentIndex].html }}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="detail-layout__page-measure-shell" aria-hidden="true">
        <div ref={measureRef} className="detail-layout__page-measure-surface content-prose" style={measureStyle}>
          {fragments.map((fragment) => (
            <div
              key={`measure-${fragment.key}`}
              className="detail-layout__page-fragment"
              dangerouslySetInnerHTML={{ __html: fragment.html }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
