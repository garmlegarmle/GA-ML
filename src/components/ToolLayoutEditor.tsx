import { useRef } from 'react';
import type { ToolLayout, ToolSection, ToolSectionLayout, ToolSlot, ToolSlotType } from '../types';

interface ToolLayoutEditorProps {
  value: ToolLayout;
  onChange: (value: ToolLayout) => void;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeSlot(type: ToolSlotType): ToolSlot {
  return { type, content: '' };
}

function makeSection(layout: ToolSectionLayout): ToolSection {
  const slots: ToolSlot[] =
    layout === 'two-col'
      ? [makeSlot('program'), makeSlot('text')]
      : [makeSlot('program')];
  return { id: generateId(), enabled: true, layout, slots };
}

function updateSection(sections: ToolSection[], id: string, updater: (s: ToolSection) => ToolSection): ToolSection[] {
  return sections.map((s) => (s.id === id ? updater(s) : s));
}

export function ToolLayoutEditor({ value, onChange }: ToolLayoutEditorProps) {
  const sections = value.sections;
  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  function setSections(next: ToolSection[]) {
    onChange({ sections: next });
  }

  function addSection(layout: ToolSectionLayout) {
    setSections([...sections, makeSection(layout)]);
  }

  function removeSection(id: string) {
    setSections(sections.filter((s) => s.id !== id));
  }

  function toggleEnabled(id: string) {
    setSections(updateSection(sections, id, (s) => ({ ...s, enabled: !s.enabled })));
  }

  function changeLayout(id: string, layout: ToolSectionLayout) {
    setSections(
      updateSection(sections, id, (s) => {
        const slots: ToolSlot[] =
          layout === 'two-col'
            ? [s.slots[0] || makeSlot('program'), s.slots[1] || makeSlot('text')]
            : [s.slots[0] || makeSlot('program')];
        return { ...s, layout, slots };
      })
    );
  }

  function changeSlotType(id: string, slotIndex: number, type: ToolSlotType) {
    setSections(
      updateSection(sections, id, (s) => {
        const slots = [...s.slots];
        slots[slotIndex] = { ...slots[slotIndex], type };
        return { ...s, slots };
      })
    );
  }

  function changeSlotContent(id: string, slotIndex: number, content: string) {
    setSections(
      updateSection(sections, id, (s) => {
        const slots = [...s.slots];
        slots[slotIndex] = { ...slots[slotIndex], content };
        return { ...s, slots };
      })
    );
  }

  function handleDragStart(id: string) {
    dragId.current = id;
  }

  function handleDragOver(event: React.DragEvent, id: string) {
    event.preventDefault();
    dragOverId.current = id;
  }

  function handleDrop() {
    const from = dragId.current;
    const to = dragOverId.current;
    if (!from || !to || from === to) {
      dragId.current = null;
      dragOverId.current = null;
      return;
    }
    const fromIndex = sections.findIndex((s) => s.id === from);
    const toIndex = sections.findIndex((s) => s.id === to);
    const next = [...sections];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setSections(next);
    dragId.current = null;
    dragOverId.current = null;
  }

  return (
    <div className="tool-layout-editor">
      {sections.length === 0 && (
        <p className="list-tags">섹션이 없습니다. 아래에서 추가하세요.</p>
      )}

      {sections.map((section, index) => (
        <div
          key={section.id}
          className={`tool-layout-section-card${section.enabled ? '' : ' tool-layout-section-card--disabled'}`}
          draggable
          onDragStart={() => handleDragStart(section.id)}
          onDragOver={(e) => handleDragOver(e, section.id)}
          onDrop={handleDrop}
        >
          <div className="tool-layout-section-card__header">
            <span className="tool-layout-drag-handle" title="드래그해서 순서 변경">⠿</span>
            <span className="tool-layout-section-card__index">#{index + 1}</span>

            <label className="tool-layout-section-card__enabled">
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={() => toggleEnabled(section.id)}
              />
              {section.enabled ? '표시' : '숨김'}
            </label>

            <label className="tool-layout-section-card__layout-label">
              레이아웃
              <select
                value={section.layout}
                onChange={(e) => changeLayout(section.id, e.target.value as ToolSectionLayout)}
              >
                <option value="full">전체 너비 (1열)</option>
                <option value="two-col">2열 (좌/우)</option>
              </select>
            </label>

            <button
              type="button"
              className="admin-btn admin-btn--secondary tool-layout-delete-btn"
              onClick={() => removeSection(section.id)}
            >
              삭제
            </button>
          </div>

          <div className={`tool-layout-slots tool-layout-slots--${section.layout}`}>
            {section.slots.map((slot, slotIndex) => (
              <div key={`slot-${slotIndex}`} className="tool-layout-slot">
                <div className="tool-layout-slot__header">
                  <span className="tool-layout-slot__label">
                    {section.layout === 'two-col' ? (slotIndex === 0 ? '왼쪽' : '오른쪽') : '콘텐츠'}
                  </span>
                  <label className="tool-layout-slot__type-label">
                    블록 유형
                    <select
                      value={slot.type}
                      onChange={(e) => changeSlotType(section.id, slotIndex, e.target.value as ToolSlotType)}
                    >
                      <option value="program">프로그램/도구 영역</option>
                      <option value="text">텍스트 (HTML)</option>
                    </select>
                  </label>
                </div>

                {slot.type === 'text' && (
                  <textarea
                    className="tool-layout-slot__textarea"
                    value={slot.content}
                    onChange={(e) => changeSlotContent(section.id, slotIndex, e.target.value)}
                    placeholder="HTML 또는 텍스트 입력..."
                    rows={5}
                  />
                )}

                {slot.type === 'program' && (
                  <div className="tool-layout-slot__program-preview">
                    프로그램/도구 영역 (커버 이미지 또는 플레이스홀더)
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="tool-layout-add-row">
        <span className="tool-layout-add-label">섹션 추가:</span>
        <button
          type="button"
          className="admin-btn admin-btn--secondary"
          onClick={() => addSection('full')}
        >
          + 전체 너비 섹션
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--secondary"
          onClick={() => addSection('two-col')}
        >
          + 2열 섹션
        </button>
      </div>
    </div>
  );
}
