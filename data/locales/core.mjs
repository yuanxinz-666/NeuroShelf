const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function createTranslator(english) {
  const reverse = new Map(Object.entries(english).map(([source, value]) => [value, source]));
  const patterns = Object.entries(english).filter(([source]) => /\{\d+\}/.test(source)).map(([source, value]) => {
    const compile = text => { const parts = text.split(/(\{\d+\})/), positions = []; return { regex: new RegExp('^' + parts.map(part => /^\{\d+\}$/.test(part) ? (positions.push(Number(part.slice(1, -1))), '([\\s\\S]*?)') : escape(part)).join('') + '$'), positions }; };
    return { source, value, zh: compile(source), en: compile(value) };
  });
  function translate(locale, source, ...values) {
    if (typeof source !== 'string') return source;
    const key = Object.hasOwn(english, source) ? source : reverse.get(source) || source;
    const template = locale === 'zh-CN' ? key : english[key] ?? key;
    return template.replace(/\{(\d+)\}/g, (token, index) => index < values.length ? String(values[index] ?? '') : token);
  }
  function message(locale, source) {
    if (typeof source !== 'string') return source;
    const clean = source.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
    const direct = translate(locale, clean);
    if (direct !== clean || Object.hasOwn(english, clean) || reverse.has(clean)) return direct;
    for (const pattern of patterns) {
      const from = locale === 'zh-CN' ? pattern.en : pattern.zh, match = clean.match(from.regex);
      if (!match) continue;
      const values = []; from.positions.forEach((position, index) => { values[position] = match[index + 1]; });
      return translate(locale, pattern.source, ...values);
    }
    return clean;
  }
  return { translate, message };
}
