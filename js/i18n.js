// AC//LAB — i18n.js
// Per the brief: the UI is English by default; only the instruction video is
// trilingual. This module provides the language-button labels and the video
// language metadata, plus a tiny lookup so a translated UI can be added later
// without touching app.js.

export const LANGS = [
  { code: 'en', label: 'ENGLISH', native: 'English', htmlLang: 'en' },
  { code: 'zh', label: '中文 · 普通话 (MANDARIN)', native: '普通话', htmlLang: 'zh' },
  { code: 'yue', label: '粵語 · CANTONESE', native: '粵語', htmlLang: 'zh-HK' }
];

export const STRINGS = {
  en: {
    proceed: 'PROCEED TO TEST',
    chooseLang: 'Choose a language to see the instruction video',
    openYouTube: 'Open on YouTube ▸'
  }
};

export function langByCode(code) { return LANGS.find(l => l.code === code) || LANGS[0]; }

export default { LANGS, STRINGS, langByCode };
if (typeof globalThis !== 'undefined') globalThis.AC_I18N = { LANGS, STRINGS, langByCode };
