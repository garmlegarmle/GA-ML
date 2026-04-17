import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MutableRefObject,
  type Ref
} from 'react';

const PAGE_RATIO = 29.7 / 21;
const PAGE_GAP = 28;
const MAX_INLINE_MARGIN = 100;
const MIN_INLINE_MARGIN = 24;
const MIN_CONTENT_WIDTH = 260;
const MAX_BLOCK_MARGIN = 40;
const MIN_BLOCK_MARGIN = 24;
const PAGE_SIZE_EPSILON = 1;
const PAGE_SPACER_CLASS = 'editor-page-spacer';

interface PageMetrics {
  pageHeight: number;
  inlineMargin: number;
  blockMargin: number;
  contentHeight: number;
}

export interface PagedEditorSurfaceProps extends HTMLAttributes<HTMLDivElement> {}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  (ref as MutableRefObject<T | null>).current = value;
}

function isPageSpacer(element: Element): boolean {
  return element.classList.contains(PAGE_SPACER_CLASS);
}

function stripPageSpacers(container: HTMLElement | null): void {
  if (!container) return;
  Array.from(container.children).forEach((child) => {
    if (isPageSpacer(child)) {
      child.remove();
    }
  });
}

function collectContentBlocks(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && !isPageSpacer(child)
  );
}

function getPageMetrics(pageWidth: number): PageMetrics {
  const safeWidth = Math.max(pageWidth, 0);
  const pageHeight = safeWidth * PAGE_RATIO;
  const inlineMargin = Math.min(MAX_INLINE_MARGIN, Math.max(MIN_INLINE_MARGIN, Math.floor((safeWidth - MIN_CONTENT_WIDTH) / 2)));
  const blockMargin = Math.min(MAX_BLOCK_MARGIN, Math.max(MIN_BLOCK_MARGIN, Math.floor(pageHeight * 0.05)));
  return {
    pageHeight,
    inlineMargin,
    blockMargin,
    contentHeight: Math.max(pageHeight - blockMargin * 2, 0)
  };
}

function createPageSpacer(doc: Document, height: number): HTMLDivElement {
  const spacer = doc.createElement('div');
  spacer.className = PAGE_SPACER_CLASS;
  spacer.setAttribute('contenteditable', 'false');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.height = `${Math.max(height, 0)}px`;
  return spacer;
}

export function serializePagedEditorHtml(editor: HTMLDivElement | null): string {
  if (!editor) return '';
  const clone = editor.cloneNode(true) as HTMLDivElement;
  stripPageSpacers(clone);
  return clone.innerHTML;
}

export const PagedEditorSurface = forwardRef<HTMLDivElement, PagedEditorSurfaceProps>(function PagedEditorSurface(
  { className = '', style, ...props },
  forwardedRef
) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const reflowingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const metrics = useMemo(() => getPageMetrics(pageWidth), [pageWidth]);
  const totalHeight = useMemo(
    () => Math.max(metrics.pageHeight * pageCount + PAGE_GAP * Math.max(pageCount - 1, 0), metrics.pageHeight),
    [metrics.pageHeight, pageCount]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateWidth = () => {
      const nextWidth = Math.round(canvas.getBoundingClientRect().width * 100) / 100;
      setPageWidth((current) => (Math.abs(current - nextWidth) < PAGE_SIZE_EPSILON ? current : nextWidth));
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || metrics.contentHeight <= 0 || metrics.pageHeight <= 0) return;

    const reflowPages = () => {
      if (!editorRef.current) return;
      reflowingRef.current = true;

      stripPageSpacers(editor);

      const blocks = collectContentBlocks(editor);
      let nextPageCount = 1;
      let usedHeight = 0;

      blocks.forEach((block) => {
        const blockHeight = Math.round(block.getBoundingClientRect().height * 100) / 100;
        if (usedHeight > 0 && usedHeight + blockHeight > metrics.contentHeight + PAGE_SIZE_EPSILON) {
          const spacerHeight = metrics.pageHeight + PAGE_GAP - usedHeight;
          editor.insertBefore(createPageSpacer(editor.ownerDocument, spacerHeight), block);
          nextPageCount += 1;
          usedHeight = 0;
        }
        usedHeight += blockHeight;
      });

      setPageCount((current) => (current === nextPageCount ? current : nextPageCount));
      reflowingRef.current = false;
    };

    const scheduleReflow = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        reflowPages();
      });
    };

    scheduleReflow();

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            if (reflowingRef.current) return;
            scheduleReflow();
          })
        : null;

    mutationObserver?.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true
    });

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (reflowingRef.current) return;
            scheduleReflow();
          })
        : null;

    resizeObserver?.observe(editor);

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      stripPageSpacers(editor);
    };
  }, [metrics.contentHeight, metrics.pageHeight]);

  const cssVars = useMemo(
    () =>
      ({
        '--editor-page-height': `${metrics.pageHeight}px`,
        '--editor-page-gap': `${PAGE_GAP}px`,
        '--editor-page-inline-padding': `${metrics.inlineMargin}px`,
        '--editor-page-block-padding': `${metrics.blockMargin}px`,
        '--editor-page-total-height': `${totalHeight}px`,
        ...style
      }) as CSSProperties,
    [metrics.blockMargin, metrics.inlineMargin, metrics.pageHeight, style, totalHeight]
  );

  return (
    <div className="editor-page-shell">
      <div ref={canvasRef} className="editor-page-canvas" style={cssVars}>
        <div className="editor-page-stack" aria-hidden="true">
          {Array.from({ length: pageCount }, (_, index) => (
            <div key={`editor-page-${index}`} className="editor-page-card" />
          ))}
        </div>
        <div
          {...props}
          ref={(node) => {
            editorRef.current = node;
            assignRef(forwardedRef, node);
          }}
          className={`editor-surface editor-surface--paged ${className}`.trim()}
        />
      </div>
    </div>
  );
});
