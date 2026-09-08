import React from 'react';
import { t } from './i18n';
import { usePanelWidth, ResizeHandle } from './ResizablePanel';

export default function ReaderWorkbench({ children, sidebar }) {
  const panel = usePanelWidth({ name: 'reader-sidebar', initial: 420, min: 320, max: 820, reserve: 380 });
  return <div ref={panel.ref} className={`reader-workbench ${panel.dragging ? 'resizing' : ''}`} style={{ gridTemplateColumns: `minmax(0, 1fr) 9px ${panel.width}px` }}>
    {children}
    <ResizeHandle panel={panel} label={t('调整阅读边栏宽度')} className="reader-resizer" />
    {sidebar}
  </div>;
}
