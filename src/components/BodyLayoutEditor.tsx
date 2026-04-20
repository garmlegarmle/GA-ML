import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { updatePost, uploadMedia } from '../lib/api';
import { t } from '../lib/site';
import type {
  BodyElement,
  BodyImageElement,
  BodyLayout,
  BodyPage,
  BodyTextElement,
  PostItem,
  SiteLang
} from '../types';
import { BodyLayoutRenderer } from './BodyLayoutRenderer';

const A3_LANDSCAPE_RATIO = 297 / 420;
const HANDLE_SIZE = 8;

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface PageFrameProps {
  page: BodyPage;
  elements: BodyElement[];
  selectedId: string | null;
  editingId: string | null;
  onSelect: (id: string | null) => void;
  onStartEdit: (id: string) => void;
  onElementChange: (id: string, partial: Partial<BodyElement>) => void;
  onDeletePage: () => void;
  lang: SiteLang;
}

function PageFrame({
  page,
  elements,
  selectedId,
  editingId,
  onSelect,
  onStartEdit,
  onElementChange,
  onDeletePage,
  lang
}: PageFrameProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    elementId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
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

  function toPercX(clientX: number): number {
    const rect = getPageRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }

  function toPercY(clientY: number): number {
    const rect = getPageRect();
    return ((clientY - rect.top) / rect.height) * 100;
  }

  function onElementPointerDown(el: BodyElement, event: React.PointerEvent<HTMLDivElement>) {
    if (editingId === el.id) return;
    event.stopPropagation();
    onSelect(el.id);
    dragState.current = {
      elementId: el.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: el.x,
      origY: el.y
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onElementPointerMove(el: BodyElement, event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current || dragState.current.elementId !== el.id) return;
    const rect = getPageRect();
    const dx = ((event.clientX - dragState.current.startX) / rect.width) * 100;
    const dy = ((event.clientY - dragState.current.startY) / rect.height) * 100;
    const newX = clamp(dragState.current.origX + dx, 0, 100 - el.width);
    const newY = clamp(dragState.current.origY + dy, 0, 100 - el.height);
    onElementChange(el.id, { x: newX, y: newY });
  }

  function onElementPointerUp(_el: BodyElement, _event: React.PointerEvent<HTMLDivElement>) {
    dragState.current = null;
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
    if (handle.includes('w')) { const newW = clamp(origW - dx, MIN_SIZE, origX + origW); x = origX + origW - newW; w = newW; }
    if (handle.includes('s')) { h = clamp(origH + dy, MIN_SIZE, 100 - origY); }
    if (handle.includes('n')) { const newH = clamp(origH - dy, MIN_SIZE, origY + origH); y = origY + origH - newH; h = newH; }

    onElementChange(el.id, { x, y, width: w, height: h });
  }

  function onHandlePointerUp(_event: React.PointerEvent<HTMLDivElement>) {
    resizeState.current = null;
  }

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="ble-page-wrapper">
      <div className="ble-page-label">
        <span>{page.id.slice(0, 8)}</span>
        <button type="button" className="ble-page-delete-btn" onClick={onDeletePage}>
          {t(lang, 'layout.deletePage')}
        </button>
      </div>
      <div
        className="ble-page-frame"
        ref={frameRef}
        style={{ paddingBottom: `${A3_LANDSCAPE_RATIO * 100}%`, position: 'relative' }}
        onClick={() => onSelect(null)}
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
              cursor: isEditing ? 'text' : 'grab',
              userSelect: isEditing ? 'text' : 'none',
              border: isSelected ? '2px solid #3b82f6' : '1px dashed rgba(100,100,200,0.35)',
              background: el.type === 'image' ? 'rgba(200,220,255,0.08)' : 'transparent',
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
                onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(el.id); }}
              >
                {el.type === 'text' ? (
                  <TextElementContent
                    element={el}
                    isEditing={isEditing}
                    onChange={(html) => onElementChange(el.id, { html })}
                  />
                ) : (
                  <ImageElementContent element={el} />
                )}

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

function TextElementContent({
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
    if (!ref.current) return;
    if (ref.current.innerHTML !== (element.html || '')) {
      ref.current.innerHTML = DOMPurify.sanitize(element.html || '');
    }
  }, [element.html, isEditing]);

  function handleBlur() {
    if (!ref.current) return;
    onChange(DOMPurify.sanitize(ref.current.innerHTML || ''));
  }

  return (
    <div
      ref={ref}
      contentEditable={isEditing}
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
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
        overflow: 'hidden',
        outline: 'none'
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
      style={{ width: '100%', height: '100%', objectFit: fit as React.CSSProperties['objectFit'], objectPosition, display: 'block' }}
    />
  );
}

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
        <input
          type="number"
          className="ble-props-input"
          value={Math.round(element.x * 10) / 10}
          step={0.5}
          onChange={(e) => onChange({ x: clamp(parseFloat(e.target.value) || 0, 0, 100 - element.width) })}
        />
        <label className="ble-props-label">Y%</label>
        <input
          type="number"
          className="ble-props-input"
          value={Math.round(element.y * 10) / 10}
          step={0.5}
          onChange={(e) => onChange({ y: clamp(parseFloat(e.target.value) || 0, 0, 100 - element.height) })}
        />
      </div>

      <div className="ble-props-panel__row">
        <label className="ble-props-label">W%</label>
        <input
          type="number"
          className="ble-props-input"
          value={Math.round(element.width * 10) / 10}
          step={0.5}
          min={5}
          max={100}
          onChange={(e) => onChange({ width: clamp(parseFloat(e.target.value) || 5, 5, 100 - element.x) })}
        />
        <label className="ble-props-label">H%</label>
        <input
          type="number"
          className="ble-props-input"
          value={Math.round(element.height * 10) / 10}
          step={0.5}
          min={5}
          max={100}
          onChange={(e) => onChange({ height: clamp(parseFloat(e.target.value) || 5, 5, 100 - element.y) })}
        />
      </div>

      {element.type === 'text' && (
        <>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.fontSize')}</label>
            <input
              type="number"
              className="ble-props-input"
              value={element.style.fontSizePt ?? 11}
              min={6}
              max={200}
              step={1}
              onChange={(e) => onChange({ style: { ...element.style, fontSizePt: parseInt(e.target.value, 10) || 11 } } as Partial<BodyTextElement>)}
            />
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">{t(lang, 'layout.textAlign')}</label>
            <select
              className="ble-props-select"
              value={element.style.textAlign || 'left'}
              onChange={(e) => onChange({ style: { ...element.style, textAlign: e.target.value as 'left' | 'center' | 'right' | 'justify' } } as Partial<BodyTextElement>)}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Bold</label>
            <input
              type="checkbox"
              checked={element.style.fontWeight === 'bold'}
              onChange={(e) => onChange({ style: { ...element.style, fontWeight: e.target.checked ? 'bold' : 'normal' } } as Partial<BodyTextElement>)}
            />
            <label className="ble-props-label">Italic</label>
            <input
              type="checkbox"
              checked={element.style.fontStyle === 'italic'}
              onChange={(e) => onChange({ style: { ...element.style, fontStyle: e.target.checked ? 'italic' : 'normal' } } as Partial<BodyTextElement>)}
            />
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Color</label>
            <input
              type="color"
              className="ble-props-color"
              value={element.style.color || '#000000'}
              onChange={(e) => onChange({ style: { ...element.style, color: e.target.value } } as Partial<BodyTextElement>)}
            />
          </div>
        </>
      )}

      {element.type === 'image' && (
        <>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Upload</label>
            <button type="button" className="ble-btn" onClick={() => fileRef.current?.click()}>
              Choose file
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Fit</label>
            <select
              className="ble-props-select"
              value={element.imageStyle?.fit || 'contain'}
              onChange={(e) => onChange({ imageStyle: { ...element.imageStyle, fit: e.target.value as 'contain' | 'cover' | 'fill' } } as Partial<BodyImageElement>)}
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Fill</option>
            </select>
          </div>
          <div className="ble-props-panel__row">
            <label className="ble-props-label">Alt</label>
            <input
              type="text"
              className="ble-props-input ble-props-input--wide"
              value={element.alt || ''}
              onChange={(e) => onChange({ alt: e.target.value } as Partial<BodyImageElement>)}
            />
          </div>
          {uploadError ? <div className="ble-props-error">{uploadError}</div> : null}
        </>
      )}
    </div>
  );
}

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

  function addTextElement(pageId: string) {
    const el: BodyTextElement = {
      id: `el-${makeId()}`,
      type: 'text',
      pageId,
      x: 10,
      y: 10,
      width: 40,
      height: 30,
      zIndex: maxZIndex() + 1,
      visible: true,
      html: '<p>Text</p>',
      style: { fontSizePt: 11, textAlign: 'left' }
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
  }

  function addImageElement(pageId: string) {
    const el: BodyImageElement = {
      id: `el-${makeId()}`,
      type: 'image',
      pageId,
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      zIndex: maxZIndex() + 1,
      visible: true,
      src: null,
      alt: 'Image',
      imageStyle: { fit: 'contain' }
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, el] }));
    setSelectedId(el.id);
  }

  function maxZIndex(): number {
    return layout.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
  }

  function deleteSelectedElement() {
    if (!selectedId) return;
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((el) => el.id !== selectedId) }));
    setSelectedId(null);
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
    updateElement(selectedId!, {
      src: srcUrl,
      mediaId: result.mediaId
    } as Partial<BodyImageElement>);
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
      if (editingId) {
        setEditingId(null);
      } else {
        setSelectedId(null);
      }
    }
  }

  const firstPageId = layout.pages[0]?.id ?? '';

  return (
    <div className="ble-root" tabIndex={-1} onKeyDown={handleKeyDown}>
      <div className="ble-toolbar">
        <span className="ble-toolbar__label">{t(lang, 'layout.editMode')}</span>
        <div className="ble-toolbar__group">
          <button type="button" className="ble-btn" onClick={addPage}>{t(lang, 'layout.addPage')}</button>
          <button type="button" className="ble-btn" onClick={() => addTextElement(selectedElement?.pageId ?? firstPageId)}>
            {t(lang, 'layout.addText')}
          </button>
          <button type="button" className="ble-btn" onClick={() => addImageElement(selectedElement?.pageId ?? firstPageId)}>
            {t(lang, 'layout.addImage')}
          </button>
        </div>
        <div className="ble-toolbar__group ble-toolbar__group--right">
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
          {layout.pages.map((page) => (
            <PageFrame
              key={page.id}
              page={page}
              elements={layout.elements.filter((el) => el.pageId === page.id)}
              selectedId={selectedId}
              editingId={editingId}
              onSelect={(id) => { setSelectedId(id); if (id !== editingId) setEditingId(null); }}
              onStartEdit={(id) => setEditingId(id)}
              onElementChange={updateElement}
              onDeletePage={() => deletePage(page.id)}
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
