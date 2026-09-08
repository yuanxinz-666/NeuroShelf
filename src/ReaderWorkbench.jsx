import React from 'react';
import { t } from './i18n';
import { usePanelWidth, ResizeHandle } from './ResizablePanel';
import { X } from 'lucide-react';

export default function ReaderWorkbench({ children, sidebar, focus = false, popup = false, popupSide = 'right', closePopup }) {
  const panel = usePanelWidth({ name: 'reader-sidebar', initial: 420, min: 320, max: 820, reserve: focus ? 460 : 380, side: focus && popupSide === 'left' ? 'left' : 'right' });
  return <div ref={panel.ref} className={`reader-workbench ${panel.dragging ? 'resizing' : ''} ${popup ? 'focus-panel-open' : ''} ${popupSide === 'left' ? 'focus-panel-left' : ''}`} style={{ gridTemplateColumns: `minmax(0, 1fr) 9px ${panel.width}px`, '--reader-sidebar-width': `${panel.width}px` }}>
    {children}
    <ResizeHandle panel={panel} label={t('调整阅读边栏宽度')} className="reader-resizer" />
    {sidebar}
    {focus && popup && <button className="focus-panel-dismiss" aria-label={t('收起阅读助手')} title={t('收起阅读助手')} onClick={closePopup}><X size={18} /></button>}
  </div>;
}
