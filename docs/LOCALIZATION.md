# Localization

NeuroShelf ships one Windows application with English (`en`) and Simplified Chinese (`zh-CN`). A missing preference defaults to English, independently of the operating system language.

## Preference lifecycle

`electron/preferences.cjs` owns `preferences.json` in the Electron user-data directory. It stores `locale` and `answerLanguage` (`auto`, `en` or `zh-CN`) separately from AI credentials and project content. Writes are queued and atomic; an unsuccessful write leaves the previous successful choice in effect. A new app version does not reset this file.

`src/i18n.js` loads the choice before rendering React. Components subscribe with `useLanguage()`. A successful change updates the current view, native window title and document language without remounting editors. The browser-only preview saves its choice in local storage instead.

## Adding interface text

- Use `t('中文文案')` for fixed labels. Chinese source strings are stable catalog keys; `data/locales/en.json` supplies the English rendering.
- Use the `tx` tagged template for labels containing values. The catalog key uses indexed placeholders such as `{0}`. Preserve every placeholder and keep interpolated user content outside the translated text.
- Use `te()` for generated status or error messages. `data/locales/core.mjs` can recognize either language and render the current choice, including known dynamic templates.
- Translate native dialogs with `tr()` in the main process. Keep machine identifiers, enum values, file formats, URLs and persisted research records independent of display language.
- Derive labels at render time. Do not cache a translated label at module initialization when it needs to change live.

Translate interface labels, generated templates, notifications and export headings. Do not bulk-translate saved paper titles, summaries, source evidence, notes, comments, PI records, experiment names or image captions.

## AI responses

The main process resolves each reading request's response language from the separate preference, falling back to the interface when set to `auto`. It snapshots the resolved value for that request. The guide translation button supplies a one-request English override. Translation appears as an AI response and never replaces the saved guide.

## Verification

Run `pnpm test`, `pnpm build` and `pnpm test:desktop`. Language tests cover first launch, persistence through a fresh preference instance, failed writes, independent AI language and placeholder integrity. The desktop workflow checks live switching with an unsaved review, reloading the saved choice, English PDF Space prompts, Chinese responses with an English interface, and the guide override through the real IPC request builder with a mock provider.
