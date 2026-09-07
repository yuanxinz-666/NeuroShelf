import { useSyncExternalStore } from 'react';
import english from '../data/locales/en.json';
import { createTranslator } from '../data/locales/core.mjs';
const translator = createTranslator(english);
let preferences = { locale: 'en', answerLanguage: 'auto' };
const listeners = new Set();
export const getPreferences = () => preferences;
export const getLocale = () => preferences.locale;
export const dateLocale = () => preferences.locale === 'zh-CN' ? 'zh-CN' : 'en-GB';
export const getAnswerLanguage = () => preferences.answerLanguage === 'auto' ? preferences.locale : preferences.answerLanguage;
export const t = (source, ...values) => translator.translate(preferences.locale, source, ...values);
export const te = source => translator.message(preferences.locale, source);
export const tx = (parts, ...values) => t(parts.reduce((key, part, index) => key + (index ? '{' + (index - 1) + '}' : '') + part, ''), ...values);
export function applyPreferences(value) {
  preferences = { locale: value?.locale === 'zh-CN' ? 'zh-CN' : 'en', answerLanguage: ['en', 'zh-CN'].includes(value?.answerLanguage) ? value.answerLanguage : 'auto' };
  document.documentElement.lang = preferences.locale;
  document.title = preferences.locale === 'zh-CN' ? 'NeuroShelf · 神经文献' : 'NeuroShelf · Research workspace';
  listeners.forEach(listener => listener());
}
export const useLanguage = () => useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, getPreferences);
const PREVIEW_KEY = 'neuroshelf:preferences:v1';
export async function loadPreferences() {
  if (window.neuroshelf) applyPreferences(await window.neuroshelf.preferences());
  else applyPreferences(JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}'));
}
export async function savePreferences(patch) {
  let next;
  if (window.neuroshelf) next = await window.neuroshelf.savePreferences(patch);
  else { next = { ...preferences, ...patch }; localStorage.setItem(PREVIEW_KEY, JSON.stringify(next)); }
  applyPreferences(next); return next;
}
