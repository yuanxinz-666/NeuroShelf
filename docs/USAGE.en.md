# NeuroShelf 0.9.1 user guide

**English** · [简体中文](USAGE.zh-CN.md) · [Project home](../README.md)

## Language

The first launch defaults to English. Change the **English / 简体中文** menu in the top bar at any time. The choice saves automatically and persists across restarts, updates and project switches under the same Windows user profile.

In **Settings & AI → Language**, set **AI response language** to follow the interface, English or Simplified Chinese. You can use an English interface with Chinese explanations, or the reverse.

Switching languages keeps your current page and editing drafts. It does not translate or overwrite paper text, saved guides, reviews, notes or experiment records. In a paper's **Reading guide**, **Translate guide into English** requests a translation through your configured AI connection and displays it in the sidebar. This one request uses English without changing your usual response preference or the original guide.

Language preferences are stored in `%APPDATA%\NeuroShelf\preferences.json`, separately from the library and AI credentials. They belong to the current Windows profile and are not included in a single project's backup.

## Open and update

Download `NeuroShelf-0.9.1-Windows.exe` from the [repository's Releases](https://github.com/yuanxinz-666/NeuroShelf/releases). Keep the portable Windows x64 executable in a permanent folder and double-click it. The app extracts when launched; its library is stored separately in local application data.

To create a desktop shortcut, right-click the EXE and use Windows' **Show more options → Send to → Desktop (create shortcut)**. When updating, point an existing shortcut to the new executable.

Existing users can export a project backup before updating. Exit the old version and open the new one under the same Windows account and application data configuration to keep using the library. Copying only the EXE to another computer does not transfer your papers or notes.

## Project storage after an update

Open **Backup & transfer** to see **Current project storage location**. PI counts, follows, detailed profiles, PDFs and experiments belong to that project folder. If an update shows the initial sample library instead, choose **Open existing project storage folder** and select the existing folder containing `index.json` and the project subfolders. The app validates it, saves the location through its own Windows process and reloads the library. Language and AI connection preferences remain unchanged.

This opens the selected folder without merging or deleting either library. Keep backups of both if you have edited both locations. A remembered folder that becomes unavailable now produces an error instead of creating a replacement sample library. Reconnect its drive or restore its location and retry.

## Adjust sidebar widths

Drag the divider beside project navigation, the library information panel, experiment details, or the reading AI/annotation panel. Each width is saved independently on this computer. Reading mode has its own navigation width; widen its icon strip to show navigation labels.

Double-click a divider to restore its default. Focus it and use the left/right arrow keys to adjust the width, or Home/End for the minimum/maximum. Widths adapt to the available window space while keeping your preference for a larger window.

## Projects and papers

Create a project from the sidebar, then enter its research question, keywords and species scope. Each project keeps its own papers, PDFs, PI records, candidates, notes and experiments. The SC–SNr sample project includes metadata and guides for 107 papers; import PDFs separately.

Use **Import PDFs** to choose or drop one or more files. When adding a full text to an existing paper, select the corresponding record; otherwise it becomes a new paper. PDFs are copied into the library, so moving the original download later does not break reading.

Write a short assessment in **My review** below a paper card. It saves automatically and is searchable alongside titles, authors and notes. Favorites, reading status and research modules help narrow the list.

## PDF reading, annotations and AI

Select readable text in a PDF and press **Space** to ask what it means. Space still types normally in text fields; repeated keys do not submit extra requests while an answer is being generated. Image-only scans need an OCR text layer from another tool before text selection is available.

Highlight a passage and add a margin comment. Opening a comment returns to its page and location. Switch between AI and annotation tabs, drag the divider to resize the sidebar, and adjust the AI font size. Notes and reading position save automatically.

Configure AI in **Settings & AI**:

- **Existing subscription:** NeuroShelf discovers the installed local Codex and uses its official login. After signing in, check the connection. You do not copy login credentials into NeuroShelf.
- **Copy context:** Copy the question and reading excerpt to ChatGPT, Codex or another assistant, then paste manually. Responses do not return to NeuroShelf automatically.
- **API:** Configure your own API key if you want this optional connection. It is separate from the subscription connection.

This version uses the GPT-6 Astra model configuration and offers low, medium, high, xhigh, max and ultra reasoning effort. The connection checks available model and effort capabilities. Visible options do not grant access your account lacks. An effort change applies to the next question; an answer in progress retains its original effort.

Questions include selected text, page context and recent conversation. Images and related pages are attached only when you choose them. Local reading, reviews, notes and experiment records do not require AI. Windows encrypts the API key locally; it is not included in library backups.

## Focus reading and keyboard shortcuts

Open a PDF and click **Focus reading** or press **F11**. The app enters native fullscreen, hides navigation and the permanent sidebar, and uses a black surround while preserving the paper's original colors. The complete document is available in one continuous scroll. Page number and previous/next controls stay visible at the bottom; you can also type a page number and press Enter. Move the mouse to the top edge for zoom, search, save and exit controls.

Move the mouse to the right edge (or click the AI tab) to open the AI sidebar at any time. Hovering does not submit a question; drafts remain when you dismiss and reopen it.

Drag over PDF text with the left mouse button. Color tools appear beside the selection. Click a color to mark it, **Annotate** to write a margin note, or **Explain selection** / **Space** to open the floating AI assistant. The assistant appears on the opposite side of the selection and can be resized. It uses your existing AI connection and effort setting. Selecting text alone does not send a request.

The visible page determines AI page context, image attachments and saved reading position. Highlighting keeps the original page number and location. Leaving and re-entering focus reading keeps the current page. Pages near the viewport are rendered as needed to limit memory use in long PDFs.

**Esc** dismisses the assistant or selection tools first; press it again to leave fullscreen. Clicking the black surround also dismisses the assistant after saving pending records. F11 toggles focus reading directly.

| Shortcut | Action |
| --- | --- |
| F11 | Enter / leave focus reading |
| Esc | Dismiss floating tools or leave focus reading |
| Space | Explain selected PDF text |
| Ctrl S | Save pending paper and experiment records immediately; save settings/project forms when open |
| Ctrl Z | Undo the last edit |
| Ctrl Y / Ctrl Shift Z | Redo the last edit |
| Ctrl F | Find text in the current PDF |
| Ctrl K | Focus the workspace search box |
| Ctrl O | Open PDF import |
| Left / Right / Page Up / Page Down | Previous / next PDF page |
| F1 / Ctrl / | Show keyboard shortcuts |

Text fields keep their normal text undo, redo, copy and paste. Outside text fields, undo covers highlights, comments, paper metadata/reviews/notes, PI follows/notes and experiment edits in the current session, separately for each project (up to 100 edits). It preserves independently saved AI replies and reading positions. Importing PDFs, restoring backups and sending AI requests are outside this edit history. Undo/redo results save to disk; the history resets when the app closes. Ctrl S complements autosave and does not export a backup.

## Candidate papers and PIs

**Project overview** can start paper screening, PI research or missing-PDF retrieval. Research progress shows its stage, elapsed time, results or failure, with a stop control. Candidates enter **Weekly papers** for your review before joining the library. Initial searches and recent updates are labeled separately.

Open a PI name or **Full profile** to explore the introduction, publication charts, keywords, academic relationships and funding projects. Publication records and the detailed profile can be refreshed separately. Use sources and verification dates to judge the record's coverage and age.

The ten-year chart uses the latest ten calendar years, with the current year covered only through the retrieval date. CNS counts include the main journals Cell, Nature and Science, excluding their sister journals. Switch between CAS top-level category Tier 1 and JCR Q1 and review the displayed coverage.

Import your own journal ranking CSV using these column names:

```csv
system,year,issn,journal,category,quartile,scie,source
```

Use `cas` or `jcr` for `system`, 1–4 for `quartile`, `true` or `false` for `scie`, and an original HTTPS source link. The selected ranking year's edition classifies the displayed records consistently; it does not infer each paper's historical ranking at publication. Unmatched records remain unknown.

Automatic Monday screening requires a personal scheduler configured separately. The project toggle records whether that project participates; the app does not install a background scheduling service. `scripts/project-inbox.cjs` provides project and validated candidate-batch operations for a scheduler. Candidates still require your review.

## Experiments and image evidence

Open **Experiments** in a project and create an experiment, then add substeps. The tree-shaped mind map lays itself out automatically. You can switch to a step list, collapse branches, zoom, pan or change a step's parent.

Each mind-map card now has a **Current progress** text box below its title. Write a short summary of what is complete, what is pending, or the next checkpoint (up to 2,000 characters). It saves automatically and appears in the step list, search results, Markdown exports and full backups. Detailed method/results records remain separate.

For each step, record its status, planned or experimental date, purpose, method and results, next action and open questions. Statuses are planned, in progress, completed and blocked. Completion is calculated from the number of steps.

Add evidence images by choosing files, dropping them or pasting them. Supported formats are PNG, JPEG and WebP, with a limit of 20 MB and 40 million pixels per image, and 60 images per step. Add captions, preview images or save an original. Originals are copied into the project's library. Archive unused branches and restore them later.

Edits save automatically. Before leaving a page or closing, the app submits current drafts; a failed save retains them and offers a retry. Markdown export contains step text and image references. Use a full backup to carry the original images with you.

## Backups and file locations

**Backup & transfer → Export complete library** backs up the current project's paper records, reading material, PIs, experiments, PDFs and evidence images. Back up each project separately. To restore, choose `library.json` from the backup folder and keep the entire folder structure; a standalone JSON file cannot restore missing PDFs or images. A backup belonging to a different project identity is not silently mixed in.

The reading-notes Markdown export includes personal reviews, highlights, comments, notes and AI conversation. Experiments have a separate Markdown export control.

Projects default to `%APPDATA%\NeuroShelf\projects`. Existing installations may use a custom location; **Project overview → Open project folder** shows the active project's actual location.

```text
project.json              Project question, keywords and settings
library/library.json      Papers, notes, PIs and experiment steps
library/pdfs/             Original PDFs
library/evidence/         Original experiment images
inbox/papers/             Candidate paper batches
inbox/people/             PI and profile batches
reports/                  Research reports
downloads/                Full-text retrieval records
resources/                Additional material
```

For a complete move to another Windows computer, exit the app and copy the whole project root with its project index and folder identities. Per-project exports do not include global login information, scheduler tasks, language preferences or custom root settings.

## Verify a download and report problems

Compare the release's `SHA256SUMS.txt` with the hash produced by PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\NeuroShelf-0.9.1-Windows.exe'
```

For problems, open a [GitHub issue](https://github.com/yuanxinz-666/NeuroShelf/issues) with the version, reproduction steps and error message. Remove personal research content from screenshots or logs before posting them publicly.
