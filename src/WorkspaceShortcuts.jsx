import React, { useEffect, useRef } from 'react';
import { X, Keyboard } from 'lucide-react';
import { t } from './i18n';

function editingText(target) {
  const element = target instanceof Element ? target : document.activeElement;
  if (element?.closest('textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return true;
  const input = element?.closest('input');
  return input && !['checkbox','radio','button','submit','range','file','color'].includes(input.type);
}
export const pdfCommand = command => window.dispatchEvent(new CustomEvent('neuroshelf:pdf-command', { detail: command }));
export function useWorkspaceShortcuts(options) {
  const current = useRef(options); current.current = options;
  useEffect(() => {
    const handler = event => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey) return;
      const actions = current.current, key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
      const dialog = document.querySelector('dialog[open]');
      if (modifier && key === 's') {
        event.preventDefault(); if (event.repeat) return;
        if (dialog) { const save = dialog.querySelector('[data-shortcut-save]'); if (save && !save.disabled) save.click(); return; }
        actions.save(); return;
      }
      if (dialog) return;
      if (modifier && ['z','y'].includes(key)) {
        if (editingText(event.target)) return;
        event.preventDefault(); if (!event.repeat) actions.history(key === 'y' || event.shiftKey ? 'redo' : 'undo'); return;
      }
      if (event.key === 'F11') { event.preventDefault(); if (!event.repeat) actions.toggleFocus(); return; }
      if (event.key === 'Escape' && actions.focus) { event.preventDefault(); actions.escapeFocus(); return; }
      if (event.key === 'F1' || modifier && key === '/') { event.preventDefault(); if (!event.repeat) actions.help(); return; }
      if (modifier && key === 'f') { event.preventDefault(); actions.find(); return; }
      if (modifier && key === 'k') { event.preventDefault(); actions.search(); return; }
      if (modifier && key === 'o') { event.preventDefault(); if (!event.repeat) actions.importPdf(); return; }
      if (!actions.pdf || modifier || event.shiftKey || editingText(event.target) || event.target?.closest?.('button,select,a')) return;
      if (['PageDown','PageUp','ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); pdfCommand(['PageDown','ArrowRight'].includes(event.key) ? 'next' : 'previous'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
export function ShortcutHelp({ close }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); return () => ref.current?.close(); }, []);
  const rows = [
    ['F11', '进入 / 退出专注阅读'], ['Esc', '先收起浮窗，再退出专注阅读'], ['Space', '选中 PDF 原文后让 AI 解释'],
    ['Ctrl S', '立即保存当前记录'], ['Ctrl Z', '撤销上一步编辑'], ['Ctrl Y / Ctrl Shift Z', '重做上一步编辑'],
    ['Ctrl F', '查找当前 PDF 原文'], ['Ctrl K', '搜索文献库'], ['Ctrl O', '导入 PDF'], ['← / → / Page Up / Page Down', '翻到上一页 / 下一页'], ['F1 / Ctrl /', '查看快捷键'],
  ];
  return <dialog ref={ref} className="modal shortcut-help" onCancel={e => { e.preventDefault(); close(); }}><div className="modal-head"><h2><Keyboard size={20} />{t('键盘快捷键')}</h2><button className="icon-button" aria-label={t('关闭快捷键说明')} onClick={close}><X size={20} /></button></div><table><tbody>{rows.map(([keys,label]) => <tr key={keys}><td><kbd>{keys}</kbd></td><td>{t(label)}</td></tr>)}</tbody></table><p>{t('输入框内保留文字的撤销、重做、复制和粘贴。其他位置的撤销用于本次打开期间的高亮、旁注、文献记录、PI 关注及实验编辑；不会撤回已发送的 AI 请求。')}</p></dialog>;
}
