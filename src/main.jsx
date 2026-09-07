import { t, tx, te, dateLocale } from './i18n';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { loadPreferences } from './i18n';
const root = createRoot(document.getElementById('root'));
loadPreferences().then(() => root.render(<App />)).catch(() => root.render(<div className="app-load"><h2>{t("Unable to read language preferences / 无法读取语言设置")}</h2><p>Please retry. Your saved language has not been overwritten.</p><button className="button" onClick={() => window.location.reload()}>{t("Retry / 重试")}</button></div>));
