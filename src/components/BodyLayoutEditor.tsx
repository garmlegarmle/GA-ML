import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { updatePost, uploadMedia } from '../lib/api';
import { t } from '../lib/site';
import type {
  BodyElement,
  BodyImageElement,
  BodyLayout,
  BodyPage,
  BodyShapeElement,
  BodyShapeType,
  BodyTableElement,
  BodyTextElement,
  PostItem,
  SiteLang
} from '../types';

const A3_LANDSCAPE_RATIO = 297 / 420;
const HANDLE_SIZE = 8;
const DRAG_THRESHOLD = 4;

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const FONT_FAMILIES = [
  { label: 'System', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica Neue, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Nanum Gothic', value: '"Nanum Gothic", sans-serif' },
  { label: 'Nanum Myeongjo', value: '"Nanum Myeongjo", serif' },
  { label: 'Apple SD Gothic', value: '"Apple SD Gothic Neo", sans-serif' },
];

function makeId(): string {
  return `${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function buildFallbackLayout(post: PostItem): BodyLayout {
  const pageId = `page-${makeId()}`;
  const elementId = `el-${makeId()}`;
  const rawContent = [post.content_before_md, post.content_md, post.content_after_md]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const html = rawContent
    ? rawContent
        .split(/\n{2,}/)
        .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
        .join('')
    : '<p>Start writing here...</p>';

  const textEl: BodyTextElement = {
    id: elementId,
    type: 'text',
    pageId,
    x: 5,
    y: 5,
    width: 90,
    height: 80,
    zIndex: 1,
    visible: true,
    html: DOMPurify.sanitize(html),
    style: { fontSizePt: 11, textAlign: 'left' }
  };

  return {
    version: 1,
    pages: [{ id: pageId }],
    elements: [textEl]
  };
}

function buildTableHtml(rows: number, cols: number): string {
  const headerRow = `<tr>${Array.from({ length: cols }, (_, i) => `<th>Header ${i + 1}</th>`).join('')}</tr>`;
  const dataRows = Array.from({ length: Math.max(rows - 1, 1) }, (_, r) =>
    `<tr>${Array.from({ length: cols }, (_, c) => `<td>Cell ${r + 1},${c + 1}</td>`).join('')}</tr>`
  ).join('');
  return `<table><thead>${headerRow}</thead><tbody>${dataRows}</tbody></table>`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Element content components ──────────────────────────────────────────────

function TextOrTableContent({
  element,
  isEditing,
  onChange
}: {
  element: BodyTextElement | BodyTableElement;
  isEditing: boolean;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { style } = element;
  const fontSizePx = style.fontSizePt ? `${(style.fontSizePt * 4) / 3}px` : undefined;

  // Sync HTML from state → DOM, but NEVER while editing (would overwrite user input)
  useEffect(() => {
    if (!ref.current || isEditing) return;
    const sanitized = DOMPurify.sanitize(element.html || '');
    if (ref.current.innerHTML !== sanitized) {
      ref.current.innerHTML = sanitized;
    }
  }, [element.html, isEditing]);

  // Focus and move cursor to end when entering edit mode
  useEffect(() => {
    if (!isEditing || !ref.current) return;
    ref.current.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [isEditing]);

  function handleBlur() {
    if (!ref.current) return;
    onChange(DOMPurify.sanitize(ref.current.innerHTML || ''));
  }

  return (
    <div
      ref={ref}
      contentEditable={isEditing || undefined}
      suppressContentEditableWarning
      style={{
        width: '100%',
        height: '100%',
        padding: '4px',
        boxSizing: 'border-box',
        fontSize: fontSizePx,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textAlign: style.textAlign as React.CSSProperties['textAlign'],
        color: style.color,
        fontFamily: style.fontFamily || undefined,
        lineHeight: style.lineHeight,
        background: style.bgColor || 'transparent',
        overflow: 'auto',
        outline: 'none',
        cursor: isEditing ? 'text' : 'inherit'
      }}
      onBlur={isEditing ? handleBlur : undefined}
    />
  );
}

function ImageElementContent({ element }: { element: BodyImageElement }) {
  const fit = element.imageStyle?.fit || 'contain';
  const objectPosition = element.imageStyle?.objectPosition || 'center';

  if (!element.src) {
    return <div className="ble-image-placeholder">{element.alt || 'Image'}</div>;
  }

  return (
    <img
      src={element.src}
      alt={element.alt || ''}
      style={{
        width: '100%',
        height: '100%',
        objectFit: fit as React.CSSProperties['objectFit'],
        objectPosition,
        display: 'block'
      }}
    />
  );
}

function ShapeContent({ element }: { element: BodyShapeElement }) {
  const { shapeType = 'rect', fill = 'rgba(59,130,246,0.25)', stroke = '#3b82f6', strokeWidth = 2 } = element;

  if (shapeType === 'line') {
    return (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: strokeWidth,
          background: stroke,
          transform: 'translateY(-50%)'
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: fill,
        border: `${strokeWidth}px solid ${stroke}`,
        borderRadius: shapeType === 'ellipse' ? '50%' : 0,
        boxSizing: 'border-box'
      }}
    />
  );
}

// ── Resize handle style helper ───────────────────────────────────────────────

function handleStyle(handle: ResizeHandle): React.CSSProperties {
  const h = HANDLE_SIZE;
  const half = h / 2;
  const base: React.CSSProperties = {
    position: 'absolute',
    width: h,
    height: h,
    background: '#3b82f6',
    border: '1px solid #fff',
    borderRadius: 2,
    zIndex: 9999
  };
  const positions: Record<ResizeHandle, React.CSSProperties> = {
    nw: { top: -half, left: -half, cursor: 'nw-resize' },
    n: { top: -half, left: `calc(50% - ${half}px)`, cursor: 'n-resize' },
    ne: { top: -half, right: -half, cursor: 'ne-resize' },
    e: { top: `calc(50% - ${half}px)`, right: -half, cursor: 'e-resize' },
    se: { bottom: -half, right: -half, cursor: 'se-resize' },
    s: { bottom: -half, left: `calc(50% - ${half}px)`, cursor: 's-resize' },
    sw: { bottom: -half, left: -half, cursor: 'sw-resize' },
    w: { top: `calc(50% - ${half}px)`, left: -half, cursor: 'w-resize' }
  };
  return { ...base, ...positions[handle] };
}

// ── PageFrame ────────────────────────────────────────────────────────────────

interface PageFrameProps {
  page: BodyPage;
  pageIndex: number;
  elements: BodyElement[];
  selectedId: string | null;
  editingId: string | null;
  onSelect: (id: string | null) => void;
  onStartEdit: (id: string) => void;
  onElementChange: (id: string, partial: Partial<BodyElement>) => void;
  onPageChange: (partial: Partial<BodyPage>) => void;
  onDeletePage: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddTable: () => void;
  onAddShape: (shapeType: BodyShapeType) => void;
  onUploadBgImage: (file: File) => Promise<void>;
  lang: SiteLang;
}

function PageFrame({
  page,
  pageIndex,
  elements,
  selectedId,
  editingId,
  onSelect,
  onStartEdit,
  onElementChange,
  onPageChange,
  onDeletePage,
  onAddText,
  onAddImage,
  onAddTable,
  onAddShape,
  onUploadBgImage,
  lang
}: PageFrameProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const bgFileRef = useRef<HTMLInputElement | null>(null);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showBgPanel, setShowBgPanel] = useState(false);

  const dragState = useRef<{
    elementId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
    wasAlreadySelected: boolean;
  } | null>(null);

  const resizeState = useRef<{
    elementId: string;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  function getPageRect() {
    return frameRef.current?.getBoundingClientRect() ?? { width: 1, height: 1, left: 0, top: 0 };
  }

  function onElementPointerDown(el: BodyElement, event: React.PointerEvent<HTMLDivElement>) {
    // When editing this element, let native contentEditable handle all events
    if (editingId === el.id) return;
    event.stopPropagation();
    const wasAlreadySelected = selectedId === el.id;
    if (!wasAlreadySelected) {
      onSelect(el.id);
    }
    dragState.current = {
      elementId: el.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: el.x,
      origY: el.y,
      hasMoved: false,
      wasAlreadySelected
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onElementPointerMove(el: BodyElement, event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current || dragState.current.elementId !== el.id) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    if (!dragState.current.hasMoved) {
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragState.current.hasMoved = true;
      } else {
        return;
      }
    }
    const rect = getPageRect();
    const pdx = (dx / rect.width) * 100;
    const pdy = (dy / rect.height) * 100;
    const newX = clamp(dragState.current.origX + pdx, 0, 100 - el.width);
    const newY = clamp(dragState.current.origY + pdy, 0, 100 - el.height);
    onElementChange(el.id, { x: newX, y: newY });
  }

  function onElementPointerUp(el: BodyElement, _event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const { hasMoved, wasAlreadySelected } = dragState.current;
    dragState.current = null;
    // Enter edit mode on second click (already selected, no drag) for text/table
    if (!hasMoved && wasAlreadySelected && (el.type === 'text' || el.type === 'table')) {
      onStartEdit(el.id);
    }
  }

  function onHandlePointerDown(el: BodyElement, handle: ResizeHandle, event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    resizeState.current = {
      elementId: el.id,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.width,
      origH: el.height
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onHandlePointerMove(el: BodyElement, event: React.PointerEvent<HTMLDivElement>) {
    if (!resizeState.current || resizeState.current.elementId !== el.id) return;
    const { handle, startX, startY, origX, origY, origW, origH } = resizeState.current;
    const rect = getPageRect();
    const dx = ((event.clientX - startX) / rect.width) * 100;
    const dy = ((event.clientY - startY) / rect.height) * 100;
    const MIN_SIZE = 5;
    let x = origX, y = origY, w = origW, h = origH;

    if (handle.includes('e')) { w = clamp(origW + dx, MIN_SIZE, 100 - origX); }
    if (handle.includes('w')) { const nw = clamp(origW - dx, MIN_SIZE, origX + origW); x = origX + origW - nw; w = nw; }
    if (handle.includes('s')) { h = clamp(origH + dy, MIN_SIZE, 100 - origY); }
    if (handle.includes('n')) { const nh = clamp(origH - dy, MIN_SIZE, origY + origH); y = origY + origH - nh; h = nh; }

    onElementChange(el.id, { x, y, width: w, height: h });
  }

  function onHandlePointerUp(_event: React.PointerEvent<HTMLDivElement>) {
    resizeState.current = null;
  }

  async function handleBgImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await onUploadBgImage(file);
    if (event.target) event.target.value = '';
  }

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  const pageStyle: React.CSSProperties = {
    paddingBottom: `${A3_LANDSCAPE_RATIO * 100}%`,
    position: 'relative',
    background: page.bgColor || '#ffffff'
  };

  if (page.bgImage) {
    pageStyle.backgroundImage = `url(${page.bgImage})`;
    pageStyle.backgroundSize = page.bgImageFit || 'cover';
    pageStyle.backgroundPosition = 'center';
    pageStyle.backgroundRepeat = 'no-repeat';
  }

  return (
    <div className="ble-page-wrapper">
      <div className="ble-page-label">
        <span className="ble-page-label__name">Page {pageIndex + 1}</span>
        <div className="ble-page-label__tools">
          <button type="button" className="ble-btn ble-btn--sm" onClick={onAddText}>{t(lang, 'layout.addText')}</button>
          <button type="button" className="ble-btn ble-btn--sm" onClick={onAddImage}>{t(lang, 'layout.addImage')}</button>
          <button type="button" className="ble-btn ble-btn--sm" onClick={onAddTable}>{t(lang, 'layout.addTable')}</button>
          <div className="ble-shape-menu-wrap">
            <button type="button" className="ble-btn ble-btn--sm" onClick={() => setShowShapeMenu((v) => !v)}>
              {t(lang, 'layout.addShape')} ▾
            </button>
            {showShapeMenu && (
              <div className="ble-shape-menu">
                {(['rect', 'ellipse', 'line'] as BodyShapeType[]).map((st) => (
                  <button key={st} type="button" className="ble-shape-menu__item"
                    onClick={() => { onAddShape(st); setShowShapeMenu(false); }}>
                    {st === 'rect' ? '□ Rect' : st === 'ellipse' ? '○ Ellipse' : '— Line'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="ble-btn ble-btn--sm" onClick={() => setShowBgPanel((v) => !v)}>
            {t(lang, 'layout.pageBg')} ▾
          </button>
          <button type="button" className="ble-btn ble-btn--sm ble-btn--danger" onClick={onDeletePage}>
            {t(lang, 'layout.deletePage')}
          </button>
        </div>
      </div>

      {showBgPanel && (
        <div className="ble-bg-panel">
          <label className="ble-props-label">{t(lang, 'layout.bgColor')}</label>
          <input
            type="color"
            className="ble-props-color"
            value={page.bgColor || '#ffffff'}
            onChange={(e) => onPageChange({ bgColor: e.target.value })}
          />
          <button type="button" className="ble-btn ble-btn--sm" style={{ marginLeft: 8 }}
            onClick={() => bgFileRef.current?.click()}>
            Upload BG Image
          </button>
          {page.bgImage && (
            <>
              <select
                className="ble-props-select"
                style={{ marginLeft: 8 }}
                value={page.bgImageFit || 'cover'}
                onChange={(e) => onPageChange({ bgImageFit: e.target.value as 'contain' | 'cover' | 'fill' })}
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill</option>
              </select>
              <button type="button" className="ble-btn ble-btn--sm ble-btn--danger" style={{ marginLeft: 8 }}
                onClick={() => onPageChange({ bgImage: undefined })}>
                Remove BG
              </button>
            </>
          )}
          <input ref={bgFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgImageUpload} />
        </div>
      )}

      <div
        className="ble-page-frame"
        ref={frameRef}
        style={pageStyle}
        onClick={() => { onSelect(null); }}
      >
        <div className="ble-page-frame__inner">
          {sortedElements.map((el) => {
            const isSelected = selectedId === el.id;
            const isEditing = editingId === el.id;

            const style: React.CSSProperties = {
              position: 'absolute',
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.width}%`,
              height: `${el.height}%`,
              zIndex: el.zIndex,
              boxSizing: 'border-box',
              // When editing, use default cursor; otherwise grab for drag
              cursor: isEditing ? 'default' : 'grab',
              userSelect: isEditing ? 'text' : 'none',
              border: isSelected ? '2px solid #3b82f6' : '1px dashed rgba(100,100,200,0.35)',
              overflow: 'hidden'
            };

            return (
              <div
                key={el.id}
                style={style}
                className="ble-element"
                onPointerDown={(e) => onElementPointerDown(el, e)}
                onPointerMove={(e) => onElementPointerMove(el, e)}
                onPointerUp={(e) => onElementPointerUp(el, e)}
                // Fix bug 2: always stop click from bubbling to frame's deselect handler
                onClick={(e) => e.stopPropagation()}
              >
                {(el.type === 'text' || el.type === 'table') ? (
                  <TextOrTableContent
                    element={el}
                    isEditing={isEditing}
                    onChange={(html) => onElementChange(el.id, { html })}
                  />
                ) : el.type === 'image' ? (
                  <ImageElementContent element={el} />
                ) : el.type === 'shape' ? (
                  <ShapeContent element={el} />
                ) : null}

                {isSelected && !isEditing && RESIZE_HANDLES.map((handle) => (
                  <div
                    key={handle}
                    className={`ble-handle ble-handle--${handle}`}
                    style={handleStyle(handle)}
                    onPointerDown={(e) => { e.stopPropagation(); onHandlePointerDown(el, handle, e); }}
                    onPointerMove={(e) => onHandlePointerMove(el, e)}
                    onPointerUp={onHandlePointerUp}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── PropertiesPanel ──────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  element: BodyElement;
  onChange: (partial: Partial<BodyElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onUploadImage: (file: File) => Promise<void>;
  lang: SiteLang;
}

function PropertiesPanel({
  element,
  onChange,
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward,
  onUploadImage,
  lang
}: PropertiesPanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState('');

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError('');
    try {
      await onUploadImage(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    }
    if (event.target) event.target.value = '';
  }

  const isTextLike = element.type === 'text' || element.type === 'table';
  const textEl = isTextLike ? (element as BodyTextElement | BodyTableElement) : null;
  const imgEl = element.type === 'image' ? (element as BodyImageElement) : null;
  const shapeEl = element.type === 'shape' ? (element as BodyShapeElement) : null;

  function onStyleChange(partial: Partial<(BodyTextElement | BodyTableElement)['style']>) {
    if (!textEl) return;
    onChange({ style: { ...textEl.style, ...partial } } as Partial<BodyElement>);
  }

  return (
    <div className="ble-props-panel">
      <div className="ble-props-panel__row ble-props-panel__row--actions">
        <button type="button" className="ble-btn ble-btn--danger" onClick={onDelete}>{t(lang, 'layout.deleteElement')}</button>
        <button type="button" className="ble-btn" onClick={onDuplicate}>{t(lang, 'layout.duplicate')}</button>
        <button type="button" className="ble-btn" onClick={onBringForward}>{t(lang, 'layout.bringForward')}</button>
        <button type="button" className="ble-btn" onClick={onSendBackward}>{t(lang, 'layout.sendBackward')}</button>
      </div>

      <div className="ble-props-panel__row">
        <label className="ble-props-label">X%</label>
        <input type="number" className="ble-props-input" value={Math.round(element.x * 10) / 10} step={0.5}
          onChange={(e) => onChange({ x: clamp(parseFloat(e.target.value) || 0, 0, 100 - element.width) })} />
        <label className="ble-props-label">Y%</label>
        <input type="number" className="ble-props-input" value={Math.round(element.y * 10) / 10} step={0.5}
          onChange={(e) => onChange({ y: clamp(parseFloat(e.target.value) || 0, 0, 100 - element.height) })} />
      </div>

      <div className="ble-props-panel__row">
        <label className="ble-props-label">W%</label>
        <input type="number" className="ble-props-input" value={Math.round(element.width * 10) / 10} step={0.5} min={5} max={100}
          onChange={(e) => onChange({ width: clamp(parseFloat(e.target.value) || 5, 5, 100 - element.x) })} />
        <label className="ble-props-label">H%</label>
        <input type="number" className="ble-props-input" value={Math.round(element.height * 10) / 10} step={0.5} min={5} max={100}
          onChange={(e) => onChange({ height: clamp(parseFloat(e.target.value) || 5, 5, 100 - element.y) })} />
      </div>

      {textEl && (
        <>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.fontSize')}</label>
            <input type="number" className="ble-props-input" value={textEl.style.fontSizePt ?? 11}
              min={6} max={200} step={1}
              onChange={(e) => onStyleChange({ fontSizePt: parseInt(e.target.value, 10) || 11 })} />
          </div>

          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.fontFamily')}</label>
            <select className="ble-props-select ble-props-select--wide"
              value={textEl.style.fontFamily || ''}
              onChange={(e) => onStyleChange({ fontFamily: e.target.value || undefined })}>
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.textAlign')}</label>
            <select className="ble-props-select"
              value={textEl.style.textAlign || 'left'}
              onChange={(e) => onStyleChange({ textAlign: e.target.value as 'left' | 'center' | 'right' | 'justify' })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
          </div>

          <div className="ble-props-panel__row">
            <label className="ble-props-label">Bold</label>
            <input type="checkbox" checked={textEl.style.fontWeight === 'bold'}
              onChange={(e) => onStyleChange({ fontWeight: e.target.checked ? 'bold' : 'normal' })} />
            <label className="ble-props-label">Italic</label>
            <input type="checkbox" checked={textEl.style.fontStyle === 'italic'}
              onChange={(e) => onStyleChange({ fontStyle: e.target.checked ? 'italic' : 'normal' })} />
          </div>

          <div className="ble-props-panel__row">
            <label className="ble-props-label">Color</label>
            <input type="color" className="ble-props-color"
              value={textEl.style.color || '#000000'}
              onChange={(e) => onStyleChange({ color: e.target.value })} />
            <label className="ble-props-label">{t(lang, 'layout.bgColor')}</label>
            <input type="color" className="ble-props-color"
              value={textEl.style.bgColor || '#ffffff'}
              onChange={(e) => onStyleChange({ bgColor: e.target.value })} />
            <button type="button" className="ble-btn ble-btn--sm" style={{ marginLeft: 4 }}
              onClick={() => onStyleChange({ bgColor: undefined })}>✕</button>
          </div>
        </>
      )}

      {imgEl && (
        <>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Upload</label>
            <button type="button" className="ble-btn" onClick={() => fileRef.current?.click()}>Choose file</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Fit</label>
            <select className="ble-props-select"
              value={imgEl.imageStyle?.fit || 'contain'}
              onChange={(e) => onChange({ imageStyle: { ...imgEl.imageStyle, fit: e.target.value as 'contain' | 'cover' | 'fill' } } as Partial<BodyImageElement>)}>
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Fill</option>
            </select>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Alt</label>
            <input type="text" className="ble-props-input ble-props-input--wide" value={imgEl.alt || ''}
              onChange={(e) => onChange({ alt: e.target.value } as Partial<BodyImageElement>)} />
          </div>
          {uploadError ? <div className="ble-props-error">{uploadError}</div> : null}
        </>
      )}

      {shapeEl && (
        <>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.shapeType')}</label>
            <select className="ble-props-select"
              value={shapeEl.shapeType}
              onChange={(e) => onChange({ shapeType: e.target.value as BodyShapeType } as Partial<BodyShapeElement>)}>
              <option value="rect">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="line">Line</option>
            </select>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.fill')}</label>
            <input type="color" className="ble-props-color"
              value={shapeEl.fill || '#3b82f6'}
              onChange={(e) => onChange({ fill: e.target.value } as Partial<BodyShapeElement>)} />
            <label className="ble-props-label">{t(lang, 'layout.stroke')}</label>
            <input type="color" className="ble-props-color"
              value={shapeEl.stroke || '#1d4ed8'}
              onChange={(e) => onChange({ stroke: e.target.value } as Partial<BodyShapeElement>)} />
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.strokeWidth')}</label>
            <input type="number" className="ble-props-input" value={shapeEl.strokeWidth ?? 2}
              min={0} max={50} step={1}
              onChange={(e) => onChange({ strokeWidth: parseInt(e.target.value, 10) || 0 } as Partial<BodyShapeElement>)} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Main BodyLayoutEditor ────────────────────────────────────────────────────

interface BodyLayoutEditorProps {
  post: PostItem;
  lang: SiteLang;
  onSaved: (layout: BodyLayout) => void;
  onExit: () => void;
}

export function BodyLayoutEditor({ post, lang, onSaved, onExit }: BodyLayoutEditorProps) {
  const [layout, setLayout] = useState<BodyLayout>(() =>
    post.body_layout_json ?? buildFallbackLayout(post)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const didFallback = !post.body_layout_json;

  const selectedElement = selectedId ? layout.elements.find((el) => el.id === selectedId) ?? null : null;

  const updateElement = useCallback((id: string, partial: Partial<BodyElement>) => {
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => el.id === id ? { ...el, ...partial } as BodyElement : el)
    }));
  }, []);

  const updatePage = useCallback((pageId: string, partial: Partial<BodyPage>) => {
    setLayout((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => p.id === pageId ? { ...p, ...partial } : p)
    }));
  }, []);

  function addPage() {
    const pageId = `page-${makeId()}`;
    setLayout((prev) => ({
      ...prev,
      pages: [...prev.pages, { id: pageId }]
    }));
  }

  function deletePage(pageId: string) {
    if (layout.pages.length <= 1) return;
    setLayout((prev) => ({
      ...prev,
      pages: prev.pages.filter((p) => p.id !== pageId),
      elements: prev.elements.filter((el) => el.pageId !== pageId)
    }));
    if (selectedElement?.pageId === pageId) setSelectedId(null);
  }

  function maxZIndex(): number {
    return layout.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
  }

  function addTextElement(pageId: string) {
    const el: BodyTextElement = {
      id: `el-${makeId()}`, type: 'text', pageId,
      x: 10, y: 10, width: 40, height: 30,
      zIndex: maxZIndex() + 1, visible: true,
      html: '<p>Text</p>', style: { fontSizePt: 11, textAlign: 'left' }
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
    setEditingId(null);
  }

  function addImageElement(pageId: string) {
    const el: BodyImageElement = {
      id: `el-${makeId()}`, type: 'image', pageId,
      x: 10, y: 10, width: 40, height: 40,
      zIndex: maxZIndex() + 1, visible: true,
      src: null, alt: 'Image', imageStyle: { fit: 'contain' }
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
    setEditingId(null);
  }

  function addTableElement(pageId: string) {
    const rows = 3, cols = 3;
    const el: BodyTableElement = {
      id: `el-${makeId()}`, type: 'table', pageId,
      x: 5, y: 10, width: 60, height: 40,
      zIndex: maxZIndex() + 1, visible: true,
      html: buildTableHtml(rows, cols), rows, cols,
      style: { fontSizePt: 11, textAlign: 'left' }
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
    setEditingId(null);
  }

  function addShapeElement(pageId: string, shapeType: BodyShapeType) {
    const el: BodyShapeElement = {
      id: `el-${makeId()}`, type: 'shape', pageId,
      x: 20, y: 20, width: 30, height: shapeType === 'line' ? 5 : 25,
      zIndex: maxZIndex() + 1, visible: true,
      shapeType, fill: 'rgba(59,130,246,0.25)', stroke: '#3b82f6', strokeWidth: 2
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
    setEditingId(null);
  }

  function deleteSelectedElement() {
    if (!selectedId) return;
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((el) => el.id !== selectedId) }));
    setSelectedId(null);
    setEditingId(null);
  }

  function duplicateSelectedElement() {
    if (!selectedElement) return;
    const copy: BodyElement = {
      ...selectedElement,
      id: `el-${makeId()}`,
      x: selectedElement.x + 2,
      y: selectedElement.y + 2,
      zIndex: maxZIndex() + 1
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, copy] }));
    setSelectedId(copy.id);
    setEditingId(null);
  }

  function bringForward() {
    if (!selectedElement) return;
    updateElement(selectedId!, { zIndex: selectedElement.zIndex + 1 });
  }

  function sendBackward() {
    if (!selectedElement) return;
    updateElement(selectedId!, { zIndex: Math.max(1, selectedElement.zIndex - 1) });
  }

  async function handleUploadImage(file: File) {
    if (!selectedElement || selectedElement.type !== 'image') return;
    const result = await uploadMedia(file, selectedElement.alt || '');
    const srcUrl = Object.values(result.urls)[0] || null;
    updateElement(selectedId!, { src: srcUrl, mediaId: result.mediaId } as Partial<BodyImageElement>);
  }

  async function handleUploadPageBgImage(pageId: string, file: File) {
    const result = await uploadMedia(file, 'page background');
    const srcUrl = Object.values(result.urls)[0] || null;
    if (srcUrl) updatePage(pageId, { bgImage: srcUrl });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await updatePost(post.id, { body_layout_json: layout });
      onSaved(layout);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && editingId !== selectedId) {
      event.preventDefault();
      deleteSelectedElement();
    }
    if (event.key === 'Escape') {
      if (editingId) setEditingId(null);
      else setSelectedId(null);
    }
  }

  function handleSelect(id: string | null) {
    setSelectedId(id);
    if (id !== editingId) setEditingId(null);
  }

  return (
    <div className="ble-root" tabIndex={-1} onKeyDown={handleKeyDown}>
      <div className="ble-toolbar">
        <span className="ble-toolbar__label">{t(lang, 'layout.editMode')}</span>
        <div className="ble-toolbar__group ble-toolbar__group--right">
          <button type="button" className="ble-btn" onClick={addPage}>{t(lang, 'layout.addPage')}</button>
          {error ? <span className="ble-toolbar__error">{error}</span> : null}
          <button type="button" className="ble-btn ble-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? t(lang, 'layout.saving') : t(lang, 'layout.save')}
          </button>
          <button type="button" className="ble-btn" onClick={onExit}>{t(lang, 'layout.exitEdit')}</button>
        </div>
      </div>

      {didFallback && (
        <div className="ble-fallback-notice">{t(lang, 'layout.fallbackNotice')}</div>
      )}

      <div className="ble-workspace">
        <div className="ble-canvas">
          {layout.pages.map((page, pageIndex) => (
            <PageFrame
              key={page.id}
              page={page}
              pageIndex={pageIndex}
              elements={layout.elements.filter((el) => el.pageId === page.id)}
              selectedId={selectedId}
              editingId={editingId}
              onSelect={handleSelect}
              onStartEdit={(id) => setEditingId(id)}
              onElementChange={updateElement}
              onPageChange={(partial) => updatePage(page.id, partial)}
              onDeletePage={() => deletePage(page.id)}
              onAddText={() => addTextElement(page.id)}
              onAddImage={() => addImageElement(page.id)}
              onAddTable={() => addTableElement(page.id)}
              onAddShape={(st) => addShapeElement(page.id, st)}
              onUploadBgImage={(file) => handleUploadPageBgImage(page.id, file)}
              lang={lang}
            />
          ))}
        </div>

        {selectedElement ? (
          <PropertiesPanel
            element={selectedElement}
            onChange={(partial) => updateElement(selectedId!, partial)}
            onDelete={deleteSelectedElement}
            onDuplicate={duplicateSelectedElement}
            onBringForward={bringForward}
            onSendBackward={sendBackward}
            onUploadImage={handleUploadImage}
            lang={lang}
          />
        ) : null}
      </div>
    </div>
  );
}

export function BodyLayoutEditorInline({
  post,
  lang,
  onSaved,
  onExit
}: BodyLayoutEditorProps) {
  return (
    <div className="ble-inline-wrap">
      <BodyLayoutEditor post={post} lang={lang} onSaved={onSaved} onExit={onExit} />
    </div>
  );
}
