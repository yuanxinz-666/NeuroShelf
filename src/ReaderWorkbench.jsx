import React, { useEffect, useRef, useState } from 'react';

const WIDTH_KEY = 'neuroshelf:reader-sidebar-width';
const DEFAULT_WIDTH = 420;
function savedWidth() {
  try { const value = Number(localStorage.getItem(WIDTH_KEY)); return value >= 320 && value <= 820 ? value : DEFAULT_WIDTH; }
  catch { return DEFAULT_WIDTH; }
}

export default function ReaderWorkbench({ children, sidebar }) {
  const [preferred, setPreferred] = useState(savedWidth), [available, setAvailable] = useState(window.innerWidth - 76);
  const [dragging, setDragging] = useState(false);
  const root = useRef(null), drag = useRef(null);
  const maximum = Math.max(320, Math.min(820, available - 389));
  const width = Math.max(320, Math.min(maximum, preferred));
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(root.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { try { localStorage.setItem(WIDTH_KEY, String(preferred)); } catch {} }, [preferred]);
  function change(value) { setPreferred(Math.round(Math.max(320, Math.min(maximum, value)))); }
  function finish(event) {
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div ref={root} className={`reader-workbench ${dragging ? 'resizing' : ''}`} style={{ gridTemplateColumns: `minmax(0, 1fr) 9px ${width}px` }}>
    {children}
    <div className="reader-resizer" role="separator" tabIndex={0} aria-label="调整阅读边栏宽度" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={maximum} aria-valuenow={width} title="拖动调整边栏宽度 · 双击恢复默认宽度" onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width }; setDragging(true);
    }} onPointerMove={event => { if (drag.current) change(drag.current.width + drag.current.x - event.clientX); }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { drag.current = null; setDragging(false); }} onDoubleClick={() => change(DEFAULT_WIDTH)} onKeyDown={event => {
      const value = { ArrowLeft: width + 24, ArrowRight: width - 24, Home: 320, End: maximum }[event.key];
      if (value !== undefined) { event.preventDefault(); change(value); }
    }}><span /></div>
    {sidebar}
  </div>;
}
