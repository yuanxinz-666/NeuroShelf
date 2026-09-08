import React from 'react';
import { FolderOpen, ChevronRight } from 'lucide-react';
import { t } from './i18n';
import { api } from './bridge';

export default function ProjectLocation({ directory, busy, choose }) {
  if (!api.desktop) return null;
  return <section className="project-location">
    <strong>{t('当前项目资料位置')}</strong><code>{directory}</code>
    <p>{t('PI、关注、详细档案和实验记录随项目资料夹保存。升级后数量不符时，请先核对这里。')}</p>
    <button className="button" disabled={busy} onClick={choose}><FolderOpen size={16} />{t('打开已有项目资料夹')}<ChevronRight size={15} /></button>
    <small>{t('选择含 index.json 的资料夹。软件会验证并记住位置；当前资料夹仍保留。')}</small>
  </section>;
}
