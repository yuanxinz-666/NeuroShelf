import React, { useState } from 'react';
import { Languages } from 'lucide-react';
import { t, te, useLanguage, savePreferences } from './i18n';

export function LanguageSettings({ compact = false }) {
  const preferences = useLanguage(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function change(patch) {
    setBusy(true); setError('');
    try { await savePreferences(patch); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  const selector = <select aria-label="Interface language / 界面语言" value={preferences.locale} disabled={busy} onChange={event => change({ locale: event.target.value })}><option value="en">English</option><option value="zh-CN">简体中文</option></select>;
  if (compact) return <div className="language-switch"><Languages size={15} />{selector}{error && <span className="language-error" role="alert">{te(error)}</span>}</div>;
  return <section className="language-settings"><h3>{t('语言')}</h3><div className="language-fields"><label>{t('界面语言')}{selector}</label><label>{t('AI 回答语言')}<select aria-label="AI response language / AI 回答语言" value={preferences.answerLanguage} disabled={busy} onChange={event => change({ answerLanguage: event.target.value })}><option value="auto">{t('跟随界面语言')}</option><option value="en">English</option><option value="zh-CN">简体中文</option></select></label></div><p>{t('选择后自动保存，重启、升级和切换项目后仍然保留。已有笔记和研究资料保持原文。')}</p>{error && <p className="inline-error" role="alert">{te(error)}</p>}</section>;
}
