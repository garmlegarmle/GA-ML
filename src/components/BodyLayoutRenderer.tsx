import DOMPurify from 'dompurify';
import type { BodyElement, BodyLayout, BodyPage, BodyShapeElement, BodyTableElement, BodyTextElement } from '../types';

const A3_LANDSCAPE_RATIO = 297 / 420;

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

function TextOrTableBlock({
  element,
  isEditMode,
  isSelected,
  onSelect
}: {
  element: BodyTextElement | BodyTableElement;
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
    fontFamily: style.fontFamily || undefined,
    lineHeight: style.lineHeight,
    background: style.bgColor || 'transparent',
    cursor: isEditMode ? 'pointer' : 'default',
    outline: isEditMode && isSelected
      ? '2px solid var(--layout-select-color, #3b82f6)'
      : isEditMode
      ? '1px dashed rgba(59,130,246,0.3)'
      : 'none',
    outlineOffset: isEditMode ? '-1px' : undefined
  };

  return (
    <div
      style={inlineStyle}
      className={element.type === 'table' ? 'blr-table-element' : 'blr-text-element'}
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
    outline: isEditMode && isSelected
      ? '2px solid var(--layout-select-color, #3b82f6)'
      : isEditMode
      ? '1px dashed rgba(59,130,246,0.3)'
      : 'none',
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

function ShapeBlock({
  element,
  isEditMode,
  isSelected,
  onSelect
}: {
  element: BodyShapeElement;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect?: () => void;
}) {
  const { shapeType = 'rect', fill = 'rgba(59,130,246,0.25)', stroke = '#3b82f6', strokeWidth = 2 } = element;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    zIndex: element.zIndex,
    boxSizing: 'border-box',
    cursor: isEditMode ? 'pointer' : 'default',
    outline: isEditMode && isSelected
      ? '2px solid var(--layout-select-color, #3b82f6)'
      : isEditMode
      ? '1px dashed rgba(59,130,246,0.3)'
      : 'none',
    outlineOffset: isEditMode ? '-1px' : undefined
  };

  let innerStyle: React.CSSProperties = {};
  if (shapeType === 'line') {
    innerStyle = {
      position: 'absolute', top: '50%', left: 0, right: 0,
      height: strokeWidth, background: stroke, transform: 'translateY(-50%)'
    };
  } else {
    innerStyle = {
      width: '100%', height: '100%',
      background: fill,
      border: `${strokeWidth}px solid ${stroke}`,
      borderRadius: shapeType === 'ellipse' ? '50%' : 0,
      boxSizing: 'border-box'
    };
  }

  return (
    <div style={containerStyle} className="blr-shape-element" onClick={isEditMode ? onSelect : undefined}>
      <div style={innerStyle} />
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
  const pageStyle: React.CSSProperties = {
    paddingBottom: `${A3_LANDSCAPE_RATIO * 100}%`,
    position: 'relative',
    background: page.bgColor || '#fff'
  };

  if (page.bgImage) {
    pageStyle.backgroundImage = `url(${page.bgImage})`;
    pageStyle.backgroundSize = page.bgImageFit || 'cover';
    pageStyle.backgroundPosition = 'center';
    pageStyle.backgroundRepeat = 'no-repeat';
  }

  return (
    <div
      className={`blr-page${isEditMode ? ' blr-page--edit' : ''}`}
      data-page-id={page.id}
      style={pageStyle}
    >
      <div className="blr-page__inner">
        {elements.map((el) => {
          const isSelected = selectedElementId === el.id;
          const onSelect = onSelectElement ? () => onSelectElement(el.id) : undefined;

          if (el.type === 'text' || el.type === 'table') {
            return (
              <TextOrTableBlock
                key={el.id}
                element={el as BodyTextElement | BodyTableElement}
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
          if (el.type === 'shape') {
            return (
              <ShapeBlock
                key={el.id}
                element={el as BodyShapeElement}
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
