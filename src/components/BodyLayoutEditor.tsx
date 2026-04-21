import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  BodyTableCell,
  BodyTableElement,
  BodyTextElement,
  PostItem,
  SiteLang
} from '../types';

const A3_LANDSCAPE_RATIO = 297 / 420;
const DRAG_THRESHOLD = 4;

// Resize handle types: corners + edges
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const CORNER_HANDLES: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
const EDGE_HANDLES: ResizeHandle[] = ['n', 'e', 's', 'w'];

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

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

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

  return { version: 1, pages: [{ id: pageId }], elements: [textEl] };
}

function buildTableRows(rows: number, cols: number): BodyTableCell[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      html: r === 0 ? `<strong>H${c + 1}</strong>` : `Cell ${r},${c + 1}`
    }))
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Convert hex + opacity (0-100) to rgba string
function hexWithOpacity(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${(clamp(opacity, 0, 100) / 100).toFixed(2)})`;
}

// Extract hex from rgba or hex string
function extractHex(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return fallback;
  return '#' + [m[1], m[2], m[3]].map((v) => parseInt(v).toString(16).padStart(2, '0')).join('');
}

function extractOpacity(color: string | undefined): number {
  if (!color) return 100;
  const m = color.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
  if (!m) return 100;
  return Math.round(parseFloat(m[1]) * 100);
}

// ── Floating text toolbar (appears above text selection) ─────────────────────

// Save/restore selection for color pickers that steal focus
let _savedRange: Range | null = null;

function saveSelectionRange() {
  const sel = window.getSelection();
  _savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
}

function restoreSelectionRange() {
  const sel = window.getSelection();
  if (_savedRange && sel) {
    sel.removeAllRanges();
    sel.addRange(_savedRange);
  }
}

function wrapSelectionStyle(styleProp: string, styleVal: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  try {
    const fragment = range.extractContents();
    const span = document.createElement('span');
    span.style.setProperty(styleProp, styleVal);
    span.appendChild(fragment);
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } catch {
    /* noop */
  }
}

function applyTextFormat(
  cmd: 'bold' | 'italic' | 'underline' | 'foreColor' | 'hiliteColor' | 'fontSize' | 'fontName',
  value?: string
) {
  document.execCommand('styleWithCSS', false, 'true');
  if (cmd === 'fontSize') {
    const px = value ? `${Math.round(parseInt(value, 10) * 4 / 3)}px` : '14px';
    wrapSelectionStyle('font-size', px);
  } else {
    document.execCommand(cmd, false, value);
  }
}

interface FloatingTextToolbarProps {
  editingId: string | null;
}

function FloatingTextToolbar({ editingId }: FloatingTextToolbarProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!editingId) { setPos(null); return; }

    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPos(null); return; }
      const range = sel.getRangeAt(0);
      const editEl = document.querySelector(`[data-el-id="${editingId}"]`);
      if (!editEl?.contains(range.commonAncestorContainer)) { setPos(null); return; }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) { setPos(null); return; }
      setPos({ left: Math.max(4, rect.left), top: Math.max(4, rect.top - 46) });
    }

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [editingId]);

  if (!pos) return null;

  return createPortal(
    <div
      className="ble-float-toolbar"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className="ble-float-btn" title="Bold" onMouseDown={() => applyTextFormat('bold')}><b>B</b></button>
      <button className="ble-float-btn" title="Italic" onMouseDown={() => applyTextFormat('italic')}><i>I</i></button>
      <button className="ble-float-btn" title="Underline" onMouseDown={() => applyTextFormat('underline')}><u>U</u></button>
      <div className="ble-float-divider" />
      <label className="ble-float-color-btn" title="Text color">
        <span style={{ borderBottom: '3px solid currentColor' }}>A</span>
        <input type="color" defaultValue="#000000"
          onFocus={saveSelectionRange}
          onChange={(e) => { restoreSelectionRange(); applyTextFormat('foreColor', e.target.value); }} />
      </label>
      <label className="ble-float-color-btn ble-float-color-btn--highlight" title="Highlight">
        <span>▣</span>
        <input type="color" defaultValue="#ffff00"
          onFocus={saveSelectionRange}
          onChange={(e) => { restoreSelectionRange(); applyTextFormat('hiliteColor', e.target.value); }} />
      </label>
      <div className="ble-float-divider" />
      <select className="ble-float-select"
        defaultValue=""
        onFocus={saveSelectionRange}
        onChange={(e) => { restoreSelectionRange(); if (e.target.value) applyTextFormat('fontSize', e.target.value); e.target.value = ''; }}>
        <option value="">pt</option>
        {FONT_SIZES.map((s) => <option key={s} value={String(s)}>{s}</option>)}
      </select>
      <select className="ble-float-select ble-float-select--wide"
        defaultValue=""
        onFocus={saveSelectionRange}
        onChange={(e) => { restoreSelectionRange(); if (e.target.value) applyTextFormat('fontName', e.target.value); e.target.value = ''; }}>
        <option value="">Font</option>
        {FONT_FAMILIES.slice(1).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
    </div>,
    document.body
  );
}

// ── Element content components ────────────────────────────────────────────────

function TextContent({
  element,
  isEditing,
  onChange
}: {
  element: BodyTextElement;
  isEditing: boolean;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { style } = element;
  const fontSizePx = style.fontSizePt ? `${(style.fontSizePt * 4) / 3}px` : undefined;

  useEffect(() => {
    if (!ref.current || isEditing) return;
    const sanitized = DOMPurify.sanitize(element.html || '');
    if (ref.current.innerHTML !== sanitized) ref.current.innerHTML = sanitized;
  }, [element.html, isEditing]);

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

  return (
    <div
      ref={ref}
      data-el-id={element.id}
      contentEditable={isEditing || undefined}
      suppressContentEditableWarning
      style={{
        width: '100%', height: '100%', padding: '4px', boxSizing: 'border-box',
        fontSize: fontSizePx, fontWeight: style.fontWeight, fontStyle: style.fontStyle,
        textAlign: style.textAlign as React.CSSProperties['textAlign'],
        color: style.color, fontFamily: style.fontFamily || undefined,
        lineHeight: style.lineHeight,
        background: style.bgColor || 'transparent',
        overflow: 'auto', outline: 'none',
        cursor: isEditing ? 'text' : 'inherit'
      }}
      onBlur={isEditing ? () => { if (ref.current) onChange(DOMPurify.sanitize(ref.current.innerHTML || '')); } : undefined}
    />
  );
}

// ── Table cell component ───────────────────────────────────────────────────────

function TableCell({
  cell,
  rowIndex,
  colIndex,
  isEditing,
  isSelected,
  style: tableStyle,
  borderColor,
  onCellChange,
  onCellClick
}: {
  cell: BodyTableCell;
  rowIndex: number;
  colIndex: number;
  isEditing: boolean;
  isSelected: boolean;
  style: BodyTextElement['style'];
  borderColor?: string;
  onCellChange: (html: string) => void;
  onCellClick: () => void;
}) {
  const ref = useRef<HTMLTableCellElement | null>(null);
  const fontSizePx = tableStyle.fontSizePt ? `${(tableStyle.fontSizePt * 4) / 3}px` : undefined;

  useEffect(() => {
    if (!ref.current || isEditing) return;
    const sanitized = DOMPurify.sanitize(cell.html || '');
    if (ref.current.innerHTML !== sanitized) ref.current.innerHTML = sanitized;
  }, [cell.html, isEditing]);

  useEffect(() => {
    if (isEditing && ref.current) ref.current.focus();
  }, [isEditing]);

  return (
    <td
      ref={ref}
      contentEditable={isEditing || undefined}
      suppressContentEditableWarning
      data-el-id={`cell-${rowIndex}-${colIndex}`}
      style={{
        border: `1px solid ${borderColor || '#ccc'}`,
        padding: '4px 6px',
        verticalAlign: 'top',
        wordBreak: 'break-word',
        minWidth: 40,
        fontSize: fontSizePx,
        fontFamily: tableStyle.fontFamily || undefined,
        background: cell.bgColor || (isSelected ? 'rgba(59,130,246,0.12)' : 'transparent'),
        outline: isEditing ? '2px solid #3b82f6' : 'none',
        cursor: isEditing ? 'text' : 'default'
      }}
      onClick={(e) => { e.stopPropagation(); onCellClick(); }}
      onBlur={isEditing ? () => { if (ref.current) onCellChange(DOMPurify.sanitize(ref.current.innerHTML || '')); } : undefined}
    />
  );
}

function TableContent({
  element,
  isEditing,
  editingCell,
  selectedCell,
  onCellChange,
  onSetEditingCell
}: {
  element: BodyTableElement;
  isEditing: boolean;
  editingCell: [number, number] | null;
  selectedCell: [number, number] | null;
  onCellChange: (row: number, col: number, html: string) => void;
  onSetEditingCell: (pos: [number, number]) => void;
}) {
  return (
    <div style={{ overflow: 'auto', width: '100%', height: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          {element.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => {
                const isCellEditing = isEditing && editingCell?.[0] === ri && editingCell?.[1] === ci;
                const isCellSelected = selectedCell?.[0] === ri && selectedCell?.[1] === ci;
                return (
                  <TableCell
                    key={ci}
                    cell={cell}
                    rowIndex={ri}
                    colIndex={ci}
                    isEditing={isCellEditing}
                    isSelected={isCellSelected}
                    style={element.style}
                    borderColor={element.borderColor}
                    onCellChange={(html) => onCellChange(ri, ci, html)}
                    onCellClick={() => { if (isEditing) onSetEditingCell([ri, ci]); }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImageContent({ element }: { element: BodyImageElement }) {
  if (!element.src) {
    return <div className="ble-image-placeholder">{element.alt || 'Image'}</div>;
  }
  return (
    <img
      src={element.src} alt={element.alt || ''}
      style={{ width: '100%', height: '100%', objectFit: (element.imageStyle?.fit || 'contain') as React.CSSProperties['objectFit'], objectPosition: element.imageStyle?.objectPosition || 'center', display: 'block' }}
    />
  );
}

function ShapeContent({ element }: { element: BodyShapeElement }) {
  const { shapeType = 'rect', strokeWidth = 2 } = element;
  const fillHex = element.fill || '#3b82f6';
  const fillOpacity = element.fillOpacity ?? 25;
  const fill = hexWithOpacity(fillHex, fillOpacity);
  const stroke = element.stroke || '#3b82f6';

  if (shapeType === 'line') {
    return (
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: strokeWidth, background: stroke, transform: 'translateY(-50%)' }} />
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', background: fill, border: `${strokeWidth}px solid ${stroke}`, borderRadius: shapeType === 'ellipse' ? '50%' : 0, boxSizing: 'border-box' }} />
  );
}

// ── Resize handle styles ──────────────────────────────────────────────────────

const CORNER_SIZE = 10;
const HALF = CORNER_SIZE / 2;

function cornerHandleStyle(handle: 'nw' | 'ne' | 'se' | 'sw'): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, background: '#3b82f6', border: '2px solid #fff', borderRadius: 2, zIndex: 9999 };
  const pos: Record<string, React.CSSProperties> = {
    nw: { top: -HALF, left: -HALF, cursor: 'nw-resize' },
    ne: { top: -HALF, right: -HALF, cursor: 'ne-resize' },
    se: { bottom: -HALF, right: -HALF, cursor: 'se-resize' },
    sw: { bottom: -HALF, left: -HALF, cursor: 'sw-resize' }
  };
  return { ...base, ...pos[handle] };
}

function edgeStripStyle(handle: 'n' | 'e' | 's' | 'w'): React.CSSProperties {
  // Full-width/height invisible strips on each edge for easy dragging
  const common: React.CSSProperties = { position: 'absolute', zIndex: 9998, background: 'transparent' };
  switch (handle) {
    case 'n': return { ...common, top: -4, left: CORNER_SIZE, right: CORNER_SIZE, height: 8, cursor: 'n-resize' };
    case 's': return { ...common, bottom: -4, left: CORNER_SIZE, right: CORNER_SIZE, height: 8, cursor: 's-resize' };
    case 'w': return { ...common, left: -4, top: CORNER_SIZE, bottom: CORNER_SIZE, width: 8, cursor: 'w-resize' };
    case 'e': return { ...common, right: -4, top: CORNER_SIZE, bottom: CORNER_SIZE, width: 8, cursor: 'e-resize' };
  }
}

// ── PageFrame ─────────────────────────────────────────────────────────────────

interface PageFrameProps {
  page: BodyPage;
  pageIndex: number;
  elements: BodyElement[];
  selectedId: string | null;
  editingId: string | null;
  editingCell: [number, number] | null;
  selectedCell: [number, number] | null;
  onSelect: (id: string | null) => void;
  onStartEdit: (id: string) => void;
  onSetEditingCell: (pos: [number, number]) => void;
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
  page, pageIndex, elements,
  selectedId, editingId, editingCell, selectedCell,
  onSelect, onStartEdit, onSetEditingCell,
  onElementChange, onPageChange, onDeletePage,
  onAddText, onAddImage, onAddTable, onAddShape,
  onUploadBgImage, lang
}: PageFrameProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const bgFileRef = useRef<HTMLInputElement | null>(null);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showBgPanel, setShowBgPanel] = useState(false);

  const dragState = useRef<{
    elementId: string;
    startX: number; startY: number;
    origX: number; origY: number;
    hasMoved: boolean;
    wasAlreadySelected: boolean;
  } | null>(null);

  const resizeState = useRef<{
    elementId: string;
    handle: ResizeHandle;
    startX: number; startY: number;
    origX: number; origY: number;
    origW: number; origH: number;
  } | null>(null);

  function getPageRect() {
    return frameRef.current?.getBoundingClientRect() ?? { width: 1, height: 1, left: 0, top: 0 };
  }

  function onElementPointerDown(el: BodyElement, event: React.PointerEvent<HTMLDivElement>) {
    if (editingId === el.id) return;
    event.stopPropagation();
    const wasAlreadySelected = selectedId === el.id;
    if (!wasAlreadySelected) onSelect(el.id);
    dragState.current = { elementId: el.id, startX: event.clientX, startY: event.clientY, origX: el.x, origY: el.y, hasMoved: false, wasAlreadySelected };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onElementPointerMove(el: BodyElement, event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current || dragState.current.elementId !== el.id) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    if (!dragState.current.hasMoved) {
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) dragState.current.hasMoved = true;
      else return;
    }
    const rect = getPageRect();
    onElementChange(el.id, {
      x: clamp(dragState.current.origX + (dx / rect.width) * 100, 0, 100 - el.width),
      y: clamp(dragState.current.origY + (dy / rect.height) * 100, 0, 100 - el.height)
    });
  }

  function onElementPointerUp(el: BodyElement, _e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const { hasMoved, wasAlreadySelected } = dragState.current;
    dragState.current = null;
    if (!hasMoved && wasAlreadySelected && (el.type === 'text' || el.type === 'table')) {
      onStartEdit(el.id);
    }
  }

  function onHandlePointerDown(el: BodyElement, handle: ResizeHandle, event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    resizeState.current = { elementId: el.id, handle, startX: event.clientX, startY: event.clientY, origX: el.x, origY: el.y, origW: el.width, origH: el.height };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onHandlePointerMove(el: BodyElement, event: React.PointerEvent<HTMLDivElement>) {
    if (!resizeState.current || resizeState.current.elementId !== el.id) return;
    const { handle, startX, startY, origX, origY, origW, origH } = resizeState.current;
    const rect = getPageRect();
    const dx = ((event.clientX - startX) / rect.width) * 100;
    const dy = ((event.clientY - startY) / rect.height) * 100;
    const MIN = 5;
    let x = origX, y = origY, w = origW, h = origH;
    if (handle.includes('e')) { w = clamp(origW + dx, MIN, 100 - origX); }
    if (handle.includes('w')) { const nw = clamp(origW - dx, MIN, origX + origW); x = origX + origW - nw; w = nw; }
    if (handle.includes('s')) { h = clamp(origH + dy, MIN, 100 - origY); }
    if (handle.includes('n')) { const nh = clamp(origH - dy, MIN, origY + origH); y = origY + origH - nh; h = nh; }
    onElementChange(el.id, { x, y, width: w, height: h });
  }

  function onHandlePointerUp(_e: React.PointerEvent<HTMLDivElement>) { resizeState.current = null; }

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
          <input type="color" className="ble-props-color" value={page.bgColor || '#ffffff'}
            onChange={(e) => onPageChange({ bgColor: e.target.value })} />
          <button type="button" className="ble-btn ble-btn--sm" style={{ marginLeft: 8 }} onClick={() => bgFileRef.current?.click()}>Upload BG</button>
          {page.bgImage && (
            <>
              <select className="ble-props-select" style={{ marginLeft: 8 }} value={page.bgImageFit || 'cover'}
                onChange={(e) => onPageChange({ bgImageFit: e.target.value as 'contain' | 'cover' | 'fill' })}>
                <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option>
              </select>
              <button type="button" className="ble-btn ble-btn--sm ble-btn--danger" style={{ marginLeft: 8 }}
                onClick={() => onPageChange({ bgImage: undefined })}>Remove BG</button>
            </>
          )}
          <input ref={bgFileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) await onUploadBgImage(f); if (e.target) e.target.value = ''; }} />
        </div>
      )}

      <div className="ble-page-frame" ref={frameRef} style={pageStyle} onClick={() => onSelect(null)}>
        <div className="ble-page-frame__inner">
          {sortedElements.map((el) => {
            const isSelected = selectedId === el.id;
            const isEditing = editingId === el.id;

            return (
              <div
                key={el.id}
                style={{
                  position: 'absolute',
                  left: `${el.x}%`, top: `${el.y}%`,
                  width: `${el.width}%`, height: `${el.height}%`,
                  zIndex: el.zIndex,
                  boxSizing: 'border-box',
                  cursor: isEditing ? 'default' : 'grab',
                  userSelect: isEditing ? 'text' : 'none',
                  border: isSelected ? '2px solid #3b82f6' : '1px dashed rgba(100,100,200,0.35)',
                  overflow: 'hidden'
                }}
                className="ble-element"
                onPointerDown={(e) => onElementPointerDown(el, e)}
                onPointerMove={(e) => onElementPointerMove(el, e)}
                onPointerUp={(e) => onElementPointerUp(el, e)}
                onClick={(e) => e.stopPropagation()}
              >
                {el.type === 'text' && (
                  <TextContent element={el} isEditing={isEditing}
                    onChange={(html) => onElementChange(el.id, { html })} />
                )}
                {el.type === 'table' && (
                  <TableContent
                    element={el} isEditing={isEditing}
                    editingCell={isEditing ? editingCell : null}
                    selectedCell={isEditing ? selectedCell : null}
                    onCellChange={(r, c, html) => {
                      const newRows = el.rows.map((row, ri) =>
                        row.map((cell, ci) => ri === r && ci === c ? { ...cell, html } : cell)
                      );
                      onElementChange(el.id, { rows: newRows } as Partial<BodyTableElement>);
                    }}
                    onSetEditingCell={onSetEditingCell}
                  />
                )}
                {el.type === 'image' && <ImageContent element={el} />}
                {el.type === 'shape' && <ShapeContent element={el} />}

                {/* Resize handles (visible corners + invisible full-edge strips) */}
                {isSelected && !isEditing && (
                  <>
                    {CORNER_HANDLES.map((handle) => (
                      <div key={handle} style={cornerHandleStyle(handle as 'nw' | 'ne' | 'se' | 'sw')}
                        onPointerDown={(e) => { e.stopPropagation(); onHandlePointerDown(el, handle, e); }}
                        onPointerMove={(e) => onHandlePointerMove(el, e)}
                        onPointerUp={onHandlePointerUp} />
                    ))}
                    {EDGE_HANDLES.map((handle) => (
                      <div key={handle} style={edgeStripStyle(handle as 'n' | 'e' | 's' | 'w')}
                        onPointerDown={(e) => { e.stopPropagation(); onHandlePointerDown(el, handle, e); }}
                        onPointerMove={(e) => onHandlePointerMove(el, e)}
                        onPointerUp={onHandlePointerUp} />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── PropertiesPanel ───────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  element: BodyElement;
  selectedCell: [number, number] | null;
  onChange: (partial: Partial<BodyElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onUploadImage: (file: File) => Promise<void>;
  lang: SiteLang;
}

function PropertiesPanel({
  element, selectedCell, onChange, onDelete, onDuplicate, onBringForward, onSendBackward, onUploadImage, lang
}: PropertiesPanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState('');

  const textEl = element.type === 'text' ? element as BodyTextElement : null;
  const tableEl = element.type === 'table' ? element as BodyTableElement : null;
  const imgEl = element.type === 'image' ? element as BodyImageElement : null;
  const shapeEl = element.type === 'shape' ? element as BodyShapeElement : null;

  function onStyleChange(partial: Partial<BodyTextElement['style']>) {
    if (textEl) onChange({ style: { ...textEl.style, ...partial } } as Partial<BodyElement>);
    if (tableEl) onChange({ style: { ...tableEl.style, ...partial } } as Partial<BodyElement>);
  }

  const currentStyle = textEl?.style ?? tableEl?.style;

  // Selected cell in table
  const selCell = tableEl && selectedCell ? tableEl.rows[selectedCell[0]]?.[selectedCell[1]] : null;

  function setCellBgColor(color: string | undefined) {
    if (!tableEl || !selectedCell) return;
    const [r, c] = selectedCell;
    const newRows = tableEl.rows.map((row, ri) =>
      row.map((cell, ci) => ri === r && ci === c ? { ...cell, bgColor: color } : cell)
    );
    onChange({ rows: newRows } as Partial<BodyElement>);
  }

  function addRow() {
    if (!tableEl) return;
    const cols = tableEl.rows[0]?.length ?? 1;
    const newRow: BodyTableCell[] = Array.from({ length: cols }, () => ({ html: '' }));
    onChange({ rows: [...tableEl.rows, newRow] } as Partial<BodyElement>);
  }

  function addCol() {
    if (!tableEl) return;
    const newRows = tableEl.rows.map((row) => [...row, { html: '' }]);
    onChange({ rows: newRows } as Partial<BodyElement>);
  }

  function deleteRow() {
    if (!tableEl || tableEl.rows.length <= 1) return;
    const r = selectedCell?.[0] ?? tableEl.rows.length - 1;
    onChange({ rows: tableEl.rows.filter((_, ri) => ri !== r) } as Partial<BodyElement>);
  }

  function deleteCol() {
    if (!tableEl) return;
    const cols = tableEl.rows[0]?.length ?? 1;
    if (cols <= 1) return;
    const c = selectedCell?.[1] ?? cols - 1;
    const newRows = tableEl.rows.map((row) => row.filter((_, ci) => ci !== c));
    onChange({ rows: newRows } as Partial<BodyElement>);
  }

  return (
    <div>
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
        <input type="number" className="ble-props-input" value={Math.round(element.width * 10) / 10} step={0.5} min={5}
          onChange={(e) => onChange({ width: clamp(parseFloat(e.target.value) || 5, 5, 100 - element.x) })} />
        <label className="ble-props-label">H%</label>
        <input type="number" className="ble-props-input" value={Math.round(element.height * 10) / 10} step={0.5} min={5}
          onChange={(e) => onChange({ height: clamp(parseFloat(e.target.value) || 5, 5, 100 - element.y) })} />
      </div>

      {currentStyle && (
        <>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.fontSize')}</label>
            <input type="number" className="ble-props-input" value={currentStyle.fontSizePt ?? 11} min={6} max={200} step={1}
              onChange={(e) => onStyleChange({ fontSizePt: parseInt(e.target.value, 10) || 11 })} />
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.fontFamily')}</label>
            <select className="ble-props-select ble-props-select--wide" value={currentStyle.fontFamily || ''}
              onChange={(e) => onStyleChange({ fontFamily: e.target.value || undefined })}>
              {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.textAlign')}</label>
            <select className="ble-props-select" value={currentStyle.textAlign || 'left'}
              onChange={(e) => onStyleChange({ textAlign: e.target.value as 'left' | 'center' | 'right' | 'justify' })}>
              <option value="left">Left</option><option value="center">Center</option>
              <option value="right">Right</option><option value="justify">Justify</option>
            </select>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Bold</label>
            <input type="checkbox" checked={currentStyle.fontWeight === 'bold'}
              onChange={(e) => onStyleChange({ fontWeight: e.target.checked ? 'bold' : 'normal' })} />
            <label className="ble-props-label">Italic</label>
            <input type="checkbox" checked={currentStyle.fontStyle === 'italic'}
              onChange={(e) => onStyleChange({ fontStyle: e.target.checked ? 'italic' : 'normal' })} />
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Color</label>
            <input type="color" className="ble-props-color" value={currentStyle.color || '#000000'}
              onChange={(e) => onStyleChange({ color: e.target.value })} />
            {textEl && (
              <>
                <label className="ble-props-label">{t(lang, 'layout.bgColor')}</label>
                <input type="color" className="ble-props-color"
                  value={extractHex(currentStyle.bgColor, '#ffffff')}
                  onChange={(e) => onStyleChange({ bgColor: e.target.value })} />
                <button type="button" className="ble-btn ble-btn--sm" style={{ marginLeft: 2 }} title="Transparent"
                  onClick={() => onStyleChange({ bgColor: undefined })}>✕</button>
              </>
            )}
          </div>
        </>
      )}

      {/* Table-specific controls */}
      {tableEl && (
        <>
          <div className="ble-props-panel__row ble-props-panel__row--actions">
            <button type="button" className="ble-btn" onClick={addRow}>{t(lang, 'layout.addRow')}</button>
            <button type="button" className="ble-btn" onClick={addCol}>{t(lang, 'layout.addCol')}</button>
            <button type="button" className="ble-btn ble-btn--danger" onClick={deleteRow}>{t(lang, 'layout.deleteRow')}</button>
            <button type="button" className="ble-btn ble-btn--danger" onClick={deleteCol}>{t(lang, 'layout.deleteCol')}</button>
          </div>
          {selCell !== null && selCell !== undefined && (
            <div className="ble-props-panel__row">
              <label className="ble-props-label">{t(lang, 'layout.cellBgColor')}</label>
              <input type="color" className="ble-props-color"
                value={extractHex(selCell.bgColor, '#ffffff')}
                onChange={(e) => setCellBgColor(e.target.value)} />
              <button type="button" className="ble-btn ble-btn--sm" style={{ marginLeft: 2 }} title="Clear"
                onClick={() => setCellBgColor(undefined)}>✕</button>
            </div>
          )}
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Border</label>
            <input type="color" className="ble-props-color"
              value={tableEl.borderColor || '#cccccc'}
              onChange={(e) => onChange({ borderColor: e.target.value } as Partial<BodyElement>)} />
          </div>
        </>
      )}

      {imgEl && (
        <>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Upload</label>
            <button type="button" className="ble-btn" onClick={() => fileRef.current?.click()}>Choose file</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploadError('');
                try { await onUploadImage(f); }
                catch (err) { setUploadError(err instanceof Error ? err.message : 'Upload failed'); }
                if (e.target) e.target.value = '';
              }} />
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Fit</label>
            <select className="ble-props-select" value={imgEl.imageStyle?.fit || 'contain'}
              onChange={(e) => onChange({ imageStyle: { ...imgEl.imageStyle, fit: e.target.value as 'contain' | 'cover' | 'fill' } } as Partial<BodyImageElement>)}>
              <option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option>
            </select>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Alt</label>
            <input type="text" className="ble-props-input ble-props-input--wide" value={imgEl.alt || ''}
              onChange={(e) => onChange({ alt: e.target.value } as Partial<BodyImageElement>)} />
          </div>
          {uploadError && <div className="ble-props-error">{uploadError}</div>}
        </>
      )}

      {shapeEl && (
        <>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.shapeType')}</label>
            <select className="ble-props-select" value={shapeEl.shapeType}
              onChange={(e) => onChange({ shapeType: e.target.value as BodyShapeType } as Partial<BodyElement>)}>
              <option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option>
            </select>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.fill')}</label>
            <input type="color" className="ble-props-color" value={extractHex(shapeEl.fill, '#3b82f6')}
              onChange={(e) => onChange({ fill: e.target.value } as Partial<BodyElement>)} />
            <label className="ble-props-label">{t(lang, 'layout.opacity')}</label>
            <input type="range" min={0} max={100} step={1}
              value={shapeEl.fillOpacity ?? 25}
              style={{ width: 60 }}
              onChange={(e) => onChange({ fillOpacity: parseInt(e.target.value, 10) } as Partial<BodyElement>)} />
            <span style={{ color: '#a0aacc', fontSize: 11, minWidth: 28 }}>{shapeEl.fillOpacity ?? 25}%</span>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.stroke')}</label>
            <input type="color" className="ble-props-color" value={shapeEl.stroke || '#3b82f6'}
              onChange={(e) => onChange({ stroke: e.target.value } as Partial<BodyElement>)} />
            <label className="ble-props-label">{t(lang, 'layout.strokeWidth')}</label>
            <input type="number" className="ble-props-input" value={shapeEl.strokeWidth ?? 2} min={0} max={50} step={1}
              onChange={(e) => onChange({ strokeWidth: parseInt(e.target.value, 10) || 0 } as Partial<BodyElement>)} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Main BodyLayoutEditor ─────────────────────────────────────────────────────

interface BodyLayoutEditorProps {
  post: PostItem;
  lang: SiteLang;
  onSaved: (layout: BodyLayout) => void;
  onExit: () => void;
}

export function BodyLayoutEditor({ post, lang, onSaved, onExit }: BodyLayoutEditorProps) {
  const [layout, setLayout] = useState<BodyLayout>(() => post.body_layout_json ?? buildFallbackLayout(post));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<[number, number] | null>(null);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPanel, setShowPanel] = useState(true);
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

  function maxZIndex() { return layout.elements.reduce((m, el) => Math.max(m, el.zIndex), 0); }

  function addPage() {
    setLayout((prev) => ({ ...prev, pages: [...prev.pages, { id: `page-${makeId()}` }] }));
  }

  function deletePage(pageId: string) {
    if (layout.pages.length <= 1) return;
    setLayout((prev) => ({
      ...prev,
      pages: prev.pages.filter((p) => p.id !== pageId),
      elements: prev.elements.filter((el) => el.pageId !== pageId)
    }));
    if (selectedElement?.pageId === pageId) { setSelectedId(null); setEditingId(null); }
  }

  function addTextElement(pageId: string) {
    const el: BodyTextElement = {
      id: `el-${makeId()}`, type: 'text', pageId,
      x: 10, y: 10, width: 40, height: 30,
      zIndex: maxZIndex() + 1, visible: true,
      html: '<p>Text</p>', style: { fontSizePt: 11, textAlign: 'left' }
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id); setEditingId(null);
  }

  function addImageElement(pageId: string) {
    const el: BodyImageElement = {
      id: `el-${makeId()}`, type: 'image', pageId,
      x: 10, y: 10, width: 40, height: 40,
      zIndex: maxZIndex() + 1, visible: true,
      src: null, alt: 'Image', imageStyle: { fit: 'contain' }
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id); setEditingId(null);
  }

  function addTableElement(pageId: string) {
    const el: BodyTableElement = {
      id: `el-${makeId()}`, type: 'table', pageId,
      x: 5, y: 10, width: 60, height: 40,
      zIndex: maxZIndex() + 1, visible: true,
      rows: buildTableRows(3, 3), style: { fontSizePt: 11, textAlign: 'left' }
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id); setEditingId(null);
  }

  function addShapeElement(pageId: string, shapeType: BodyShapeType) {
    const el: BodyShapeElement = {
      id: `el-${makeId()}`, type: 'shape', pageId,
      x: 20, y: 20, width: 30, height: shapeType === 'line' ? 5 : 25,
      zIndex: maxZIndex() + 1, visible: true,
      shapeType, fill: '#3b82f6', fillOpacity: 25, stroke: '#3b82f6', strokeWidth: 2
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id); setEditingId(null);
  }

  function deleteSelectedElement() {
    if (!selectedId) return;
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((el) => el.id !== selectedId) }));
    setSelectedId(null); setEditingId(null);
  }

  function duplicateSelectedElement() {
    if (!selectedElement) return;
    const copy: BodyElement = { ...selectedElement, id: `el-${makeId()}`, x: selectedElement.x + 2, y: selectedElement.y + 2, zIndex: maxZIndex() + 1 };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, copy] }));
    setSelectedId(copy.id); setEditingId(null);
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
    setSaving(true); setError('');
    try { await updatePost(post.id, { body_layout_json: layout }); onSaved(layout); }
    catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  function handleSelect(id: string | null) {
    setSelectedId(id);
    if (id !== editingId) { setEditingId(null); setEditingCell(null); setSelectedCell(null); }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && editingId !== selectedId) {
      event.preventDefault();
      deleteSelectedElement();
    }
    if (event.key === 'Escape') {
      if (editingId) { setEditingId(null); setEditingCell(null); }
      else setSelectedId(null);
    }
  }

  return (
    <div className="ble-root" tabIndex={-1} onKeyDown={handleKeyDown}>
      {/* Floating text selection toolbar (rendered via portal to document.body) */}
      <FloatingTextToolbar editingId={editingId} />

      <div className="ble-toolbar">
        <span className="ble-toolbar__label">{t(lang, 'layout.editMode')}</span>
        <div className="ble-toolbar__group ble-toolbar__group--right">
          <button type="button" className="ble-btn" onClick={addPage}>{t(lang, 'layout.addPage')}</button>
          {!showPanel && (
            <button type="button" className="ble-btn ble-btn--show-panel" onClick={() => setShowPanel(true)}>
              속성 ▶
            </button>
          )}
          {error && <span className="ble-toolbar__error">{error}</span>}
          <button type="button" className="ble-btn ble-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? t(lang, 'layout.saving') : t(lang, 'layout.save')}
          </button>
          <button type="button" className="ble-btn" onClick={onExit}>{t(lang, 'layout.exitEdit')}</button>
        </div>
      </div>

      {didFallback && <div className="ble-fallback-notice">{t(lang, 'layout.fallbackNotice')}</div>}

      <div className="ble-workspace">
        <div className="ble-canvas">
          {layout.pages.map((page, pageIndex) => (
            <PageFrame
              key={page.id}
              page={page} pageIndex={pageIndex}
              elements={layout.elements.filter((el) => el.pageId === page.id)}
              selectedId={selectedId} editingId={editingId}
              editingCell={editingCell} selectedCell={selectedCell}
              onSelect={handleSelect}
              onStartEdit={(id) => setEditingId(id)}
              onSetEditingCell={(pos) => { setEditingCell(pos); setSelectedCell(pos); }}
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

        {/* Properties panel — always visible; hide button inside panel header */}
        {showPanel && (
          <div className="ble-props-panel">
            <div className="ble-props-panel__head">
              <span className="ble-props-panel__title">속성</span>
              <button type="button" className="ble-props-panel__hide" title="패널 숨기기" onClick={() => setShowPanel(false)}>✕</button>
            </div>
            <div className="ble-props-panel__body">
              {selectedElement ? (
                <PropertiesPanel
                  element={selectedElement}
                  selectedCell={selectedCell}
                  onChange={(partial) => updateElement(selectedId!, partial)}
                  onDelete={deleteSelectedElement}
                  onDuplicate={duplicateSelectedElement}
                  onBringForward={() => updateElement(selectedId!, { zIndex: selectedElement.zIndex + 1 })}
                  onSendBackward={() => updateElement(selectedId!, { zIndex: Math.max(1, selectedElement.zIndex - 1) })}
                  onUploadImage={handleUploadImage}
                  lang={lang}
                />
              ) : (
                <div className="ble-props-panel__empty">
                  <div className="ble-props-panel__empty-icon">☐</div>
                  <div>요소를 클릭하면<br />속성이 표시됩니다</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BodyLayoutEditorInline({ post, lang, onSaved, onExit }: BodyLayoutEditorProps) {
  return (
    <div className="ble-inline-wrap">
      <BodyLayoutEditor post={post} lang={lang} onSaved={onSaved} onExit={onExit} />
    </div>
  );
}
