import { t } from './i18n';
import model from '../data/ai-model.json';

export { model };
export const effortLabel = effort => t(model.effortLabels[effort] || effort);
export function supportedEfforts(settings, provider = settings.provider) {
  if (provider === 'api') return model.apiEfforts;
  if (provider !== 'codex') return [];
  const available = settings.codex?.models?.find(item => item.id === model.id)?.efforts || [];
  return Object.keys(model.effortLabels).filter(effort => available.includes(effort));
}
export function answerLabel(message) {
  const name = message.model === model.id ? 'GPT-6' : message.model;
  return name ? name + (message.effort ? ' · ' + effortLabel(message.effort) : '') : '';
}
