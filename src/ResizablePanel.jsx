import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from './i18n';

export function usePanelWidth({ name, initial, min, max, reserve, side = 'right', measureParent = false }) {
  const storageKey = `neuroshelf:${name}-width`;
  const [preferred, setPreferred] = useState(() => {
    try { const value = Number(localStorage.getItem(storageKey)); return value >= min && value <= max ? value : initial; }
    catch { return initial; }
  });
  const [available, setAvailable] = useState(window.innerWidth), [dragging, setDragging] = useState(false);
  const [element, setElement] = useState(null), drag = useRef(null);
  const maximum = Math.max(min, Math.min(max, available - reserve - 9));
  const width = Math.round(Math.max(min, Math.min(maximum, preferred)));
  useLayoutEffect(() => {
    const container = measureParent ? element?.parentElement : element;
    if (!container) return;
    setAvailable(container.clientWidth);
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(container); return () => observer.disconnect();
  }, [element, measureParent]);
  function remember(next) {
    const value = Math.round(Math.max(min, Math.min(maximum, next)));
    setPreferred(value);
    try { localStorage.setItem(storageKey, String(value)); } catch {}
  }
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add('panel-resizing');
    return () => document.body.classList.remove('panel-resizing');
  }, [dragging]);
  useEffect(() => {
    // A release can land outside the moving divider, especially when Windows
    // does not retain pointer capture. Always finish the gesture at window level.
    const stop = event => {
      if (!drag.current || event.pointerId !== undefined && event.pointerId !== drag.current.pointerId) return;
      drag.current = null; setDragging(false);
    };
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
    window.addEventListener('blur', stop);
    return () => { window.removeEventListener('pointerup', stop, true); window.removeEventListener('pointercancel', stop, true); window.removeEventListener('blur', stop); };
  }, []);
  function finish(event) {
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const direction = side === 'left' ? 1 : -1;
  return { ref: setElement, width, dragging, handleProps: {
    role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-valuemin': min, 'aria-valuemax': maximum, 'aria-valuenow': width,
    onPointerDown(event) {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width, pointerId: event.pointerId }; setDragging(true);
    },
    onPointerMove(event) { if (drag.current) remember(drag.current.width + direction * (event.clientX - drag.current.x)); },
    onPointerUp: finish, onPointerCancel: finish,
    onLostPointerCapture() { drag.current = null; setDragging(false); },
    onDoubleClick() { remember(initial); },
    onKeyDown(event) {
      const value = { ArrowLeft: width - 24 * direction, ArrowRight: width + 24 * direction, Home: min, End: maximum }[event.key];
      if (value !== undefined) { event.preventDefault(); remember(value); }
    },
  } };
}

export function ResizeHandle({ panel, label, className = '' }) {
  return <div {...panel.handleProps} className={`panel-resizer ${className}`} aria-label={label} title={t('拖动调整边栏宽度 · 双击恢复默认宽度')}><span /></div>;
}
