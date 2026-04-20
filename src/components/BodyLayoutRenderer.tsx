import DOMPurify from 'dompurify';
import type { BodyElement, BodyLayout, BodyPage } from '../types';

const A3_LANDSCAPE_RATIO = 297 / 420; // height/width

interface BodyLayoutRendererProps {
  layout: BodyLayout;
  isEditMode?: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (id: string) => void;
}

function elementsForPage(layout: BodyLayout, pageId: string): BodyElement[] {
  return layout.elements
    .filter((el) => el.pageId === pageId && el.visible !== false)
    .sort((a, b) => a.zIndex - b.zIndex);
}

function TextBlock({
  element,
  isEditMode,
  isSelected,
  onSelect
}: {
  element: Extract<BodyElement, { type: 'text' }>;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect?: () => void;
}) {
  const { style } = element;
  const fontSizePx = style.fontSizePt ? `${(style.fontSizePt * 4) / 3}px` : undefined;

  const inlineStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    zIndex: element.zIndex,
    overflow: 'hidden',
    boxSizing: 'border-box',
    fontSize: fontSizePx,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textAlign: style.textAlign as React.CSSProperties['textAlign'],
    color: style.color,
    fontFamily: style.fontFamily,
    lineHeight: style.lineHeight,
    cursor: isEditMode ? 'pointer' : 'default',
    outline: isEditMode && isSelected ? '2px solid var(--layout-select-color, #3b82f6)' : isEditMode ? '1px dashed rgba(59,130,246,0.3)' : 'none',
    outlineOffset: isEditMode ? '-1px' : undefined
  };

  return (
    <div
      style={inlineStyle}
      className="blr-text-element"
      onClick={isEditMode ? onSelect : undefined}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(element.html || '') }}
    />
  );
}

function ImageBlock({
  element,
  isEditMode,
  isSelected,
  onSelect
}: {
  element: Extract<BodyElement, { type: 'image' }>;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect?: () => void;
}) {
  const fit = element.imageStyle?.fit || 'contain';
  const objectPosition = element.imageStyle?.objectPosition || 'center';

  const inlineStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    zIndex: element.zIndex,
    overflow: 'hidden',
    boxSizing: 'border-box',
    cursor: isEditMode ? 'pointer' : 'default',
    outline: isEditMode && isSelected ? '2px solid var(--layout-select-color, #3b82f6)' : isEditMode ? '1px dashed rgba(59,130,246,0.3)' : 'none',
    outlineOffset: isEditMode ? '-1px' : undefined
  };

  return (
    <div
      style={inlineStyle}
      className="blr-image-element"
      onClick={isEditMode ? onSelect : undefined}
    >
      {element.src ? (
        <img
          src={element.src}
          alt={element.alt || ''}
          style={{ width: '100%', height: '100%', objectFit: fit as React.CSSProperties['objectFit'], objectPosition, display: 'block' }}
        />
      ) : (
        <div className="blr-image-placeholder">{element.alt || 'Image'}</div>
      )}
    </div>
  );
}

function LayoutPage({
  page,
  elements,
  isEditMode,
  selectedElementId,
  onSelectElement
}: {
  page: BodyPage;
  elements: BodyElement[];
  isEditMode: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (id: string) => void;
}) {
  return (
    <div
      className={`blr-page${isEditMode ? ' blr-page--edit' : ''}`}
      data-page-id={page.id}
      style={{ paddingBottom: `${A3_LANDSCAPE_RATIO * 100}%`, position: 'relative' }}
    >
      <div className="blr-page__inner">
        {elements.map((el) => {
          const isSelected = selectedElementId === el.id;
          const onSelect = onSelectElement ? () => onSelectElement(el.id) : undefined;

          if (el.type === 'text') {
            return (
              <TextBlock
                key={el.id}
                element={el}
                isEditMode={isEditMode}
                isSelected={isSelected}
                onSelect={onSelect}
              />
            );
          }
          if (el.type === 'image') {
            return (
              <ImageBlock
                key={el.id}
                element={el}
                isEditMode={isEditMode}
                isSelected={isSelected}
                onSelect={onSelect}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export function BodyLayoutRenderer({ layout, isEditMode = false, selectedElementId, onSelectElement }: BodyLayoutRendererProps) {
  return (
    <div className={`body-layout-renderer${isEditMode ? ' body-layout-renderer--edit' : ''}`}>
      {layout.pages.map((page) => (
        <LayoutPage
          key={page.id}
          page={page}
          elements={elementsForPage(layout, page.id)}
          isEditMode={isEditMode}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
        />
      ))}
    </div>
  );
}
