import React, { useEffect, useRef } from 'react';
import { t } from './i18n';
import { usePanelWidth, ResizeHandle } from './ResizablePanel';
import { X, Sparkles } from 'lucide-react';

export default function ReaderWorkbench({ children, sidebar, focus = false, popup = false, popupSide = 'right', closePopup, openAi }) {
  const panel = usePanelWidth({ name: 'reader-sidebar', initial: 420, min: 320, max: 820, reserve: focus ? 460 : 380, side: focus && popupSide === 'left' ? 'left' : 'right' });
  const hover = useRef(null), showAi = useRef(openAi); showAi.current = openAi;
  const cancelHover = () => { clearTimeout(hover.current); hover.current = null; };
  useEffect(() => { cancelHover(); return cancelHover; }, [focus, popup]);
  function edgeMove(event) {
    if (!focus || event.buttons || panel.dragging || document.querySelector('dialog[open]')) { cancelHover(); return; }
    const bounds = event.currentTarget.getBoundingClientRect();
    const nearEdge = event.clientX >= bounds.right - 38 && event.clientY > 70 && event.clientY < bounds.bottom - 70;
    if (!nearEdge) { cancelHover(); return; }
    if (popup && popupSide === 'right') { cancelHover(); return; }
    if (hover.current === null) hover.current = setTimeout(() => { hover.current = null; showAi.current?.(); }, 220);
  }
  return <div ref={panel.ref} onPointerMove={edgeMove} onPointerLeave={cancelHover} className={`reader-workbench ${panel.dragging ? 'resizing' : ''} ${popup ? 'focus-panel-open' : ''} ${popupSide === 'left' ? 'focus-panel-left' : ''}`} style={{ gridTemplateColumns: `minmax(0, 1fr) 9px ${panel.width}px`, '--reader-sidebar-width': `${panel.width}px` }}>
    {children}
    <ResizeHandle panel={panel} label={t('调整阅读边栏宽度')} className="reader-resizer" />
    {sidebar}
    {focus && (!popup || popupSide !== 'right') && <button className="focus-ai-tab" aria-label={t('从右侧打开 AI 助手')} title={t('鼠标移到右侧即可打开 AI 助手')} onClick={openAi}><Sparkles size={17} /><span>AI</span></button>}
    {focus && popup && <button className="focus-panel-dismiss" aria-label={t('收起阅读助手')} title={t('收起阅读助手')} onClick={closePopup}><X size={18} /></button>}
  </div>;
}
