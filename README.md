ANTROR — PDF Merger
Merge PDFs exactly the way you want — select specific pages, arrange them in any order, preview the result, and download one document. Everything happens in your browser. Your files never leave your device.

VersionLicenseBackendPrivacy

ANTROR PDF Merger is a privacy-first, browser-based PDF tool built with plain HTML, CSS, and vanilla JavaScript. There is no server, no account, and no upload step — page rendering happens with PDF.js and document assembly with pdf-lib, both running locally in your browser.

Table of Contents
Features
Getting Started
How to Use
Keyboard Shortcuts
Tech Stack
Project Structure
Architecture Notes
Privacy
Browser Support
Performance
Troubleshooting
Roadmap
License
Features
Upload

Add PDFs via button, drag & drop anywhere on the page, or multi-file selection
Add more PDFs at any time, in any order
Validation with clear, human error messages: non-PDF files, empty files, oversized files (200 MB limit), corrupted documents, password-protected files, and duplicates
Select pages — the core of the tool

Toggle any page individually (orange outline + checkmark — never color alone)
All / Invert / Clear per document
Range input with full validation: 1-3, 7, 10-12
Live per-document counter (8 / 15 selected) and global totals
Arrange

Dedicated Merge Sequence panel showing the exact final page order
Drag any page anywhere (mouse and touch supported, with edge auto-scroll)
Insert before/after any row, from any loaded document
Duplicate a page (repeat a form page as many times as needed)
Remove any page from the sequence — the original PDF is never touched
Reorder entire documents; the default sequence rebuilds automatically
One-click rebuild of the sequence from the current selection
Preview, merge, download

Final preview dialog listing every page in order before you commit
Live counters: PDFs · Selected pages · Final pages (duplicates included)
Staged merge progress: Preparing → Processing → Building → Complete
Renameable output file (merged-document.pdf by default) plus an"open in new tab" fallback if your browser blocks downloads
Experience

Light & dark themes (remembered between visits)
Undo / redo for every workspace action (100 steps)
Zoomable thumbnails (S / M / L) with lazy, memory-capped rendering
Fully responsive — the layout stacks on mobile, with touch drag support
Accessible: keyboard navigation, ARIA labels, visible focus states
Built-in Privacy Policy, Terms & Conditions, About, and Contact pages
Getting Started
No build step. No install. No dependencies to manage.

antror-pdf-merger/├── index.html├── css/│   └── style.css└── js/    └── app.js
Download or clone the folder.
Open index.html in any modern browser — double-clicking it works fine.
That's it.
The two PDF libraries and the fonts load from CDNs, so the first load needs an internet connection. To run fully offline, see Self-hosting the libraries.

Optional: serve locally
Opening the file directly is fine, but if you prefer a local server:

# any one of thesenpx serve .python -m http.server 8080
Self-hosting the libraries
For maximum privacy (zero external requests) or offline use, download the three files, put them in a vendor/ folder, and update the references:

vendor/├── pdf.min.js├── pdf.worker.min.js└── pdf-lib.min.js
In index.html, point the two <script src="…"> tags at the local copies.
In js/app.js, update the pdfjsLib.GlobalWorkerOptions.workerSrc line to vendor/pdf.worker.min.js.
How to Use
Upload  →  Select pages  →  Build the sequence  →  Review  →  Merge  →  Download
Add PDFs. Click Add PDFs or drop files anywhere on the page. Each document becomes a card with page thumbnails.
Select pages. Click thumbnails, use All / Invert / Clear, or type ranges like 1-3, 7, 10-12 under Range…. Every selected page is appended to the Merge Sequence.
Arrange. In the Merge Sequence panel, drag rows into the exact final order. Use the row actions to insert, duplicate, or remove pages. A removed page only leaves the output — the source PDF is untouched.
Review. Check the counters in the status bar, or open Preview to see the full planned order with thumbnails.
Merge. Click Merge PDFs. Progress is shown per stage; large files never freeze the page.
Download. Rename the file if you like and click Download PDF.
Verify the core flow
The tool is correct if this exact operation works:

Source	Select	Arrange (in this order)
A.pdf (10 pages)	1, 3, 7	A-1, B-4, A-7, C-1, B-2, A-3, C-5, B-8
B.pdf (8 pages)	2, 4, 8	
C.pdf (5 pages)	1, 5	
Merging must produce an 8-page PDF containing exactly those pages in exactly that order — including interleaved sources and duplicates.

Keyboard Shortcuts
Shortcut	Action
Ctrl/⌘ + O	Add PDFs
Ctrl/⌘ + Z	Undo
Ctrl/⌘ + Y (or Ctrl/⌘ + Shift + Z)	Redo
Ctrl/⌘ + A	Select all pages in all documents
Delete / Backspace	Remove the active page from the sequence
Home / End	Move the active page to the start / end of the sequence
Alt + ↑ / Alt + ↓	Move the active page up / down
Enter	Apply range input · confirm dialogs · start download
Esc	Close dialogs · cancel range input · clear active row
Shortcuts are never destructive without a clearly visible active row.

Tech Stack
Layer	Choice	Why
UI	HTML5 + CSS3 + Vanilla JS	Zero framework overhead, fully auditable
PDF rendering	PDF.js (Mozilla)	Canvas rendering of page thumbnails
PDF assembly	pdf-lib	Copying pages into a new document, locally
Fonts	Space Grotesk · JetBrains Mono	Brand identity + technical numerals
No bundler, no transpiler, no package manager. The app is three static files.

Project Structure
antror-pdf-merger/├── index.html          # markup: header, workspace, panels, footer, overlays├── css/│   └── style.css       # design tokens (light/dark), components, responsive rules└── js/    └── app.js          # all logic, organized in sections:                        #   icons · state · history · toast · modal                        #   pdf-loader · thumbnail renderer · selection                        #   sequence ops · drag & drop · merge · download                        #   zoom · theme · shortcuts · footer/legal · boot
Architecture Notes
Worth knowing if you want to extend the app:

Selection and sequence are decoupled. Each document holds a Set of selected page numbers; the final merge order is a separate array of {docId, pageNumber} entries. Selecting appends to the sequence; arranging never touches selection. This separation is what makes interleaving and duplication safe.
Thumbnails are lazy and cached. An IntersectionObserver queues renders only for pages near the viewport (max 5 concurrent), results are cached per page/zoom, and canvas pixel counts are capped for very large documents.
Undo/redo is snapshot-based. Every mutation captures a small snapshot of order + selection + sequence (capped at 100), so any future feature that mutates the workspace gets undo for free by calling History.capture() first.
Merging yields to the UI thread (requestAnimationFrame between page copies) so the progress UI stays live even with hundreds of pages.
Object URLs are managed carefully. The merged PDF's blob URL is revoked 60 seconds after the dialog closes — revoking earlier is what silently kills downloads while a "Save As" dialog is open.
Privacy
This tool is built so that it cannot leak your documents, because it never receives them:

You → Browser (PDF.js + pdf-lib) → Merged PDF → Download
No uploads, no server, no analytics, no cookies, no accounts.
Everything lives in memory; closing the tab discards all files and selections.
Exactly one thing is stored in localStorage: your theme preference (antror-theme).
PDF binaries are never persisted anywhere.
Full details are in the in-app Privacy Policy (footer).

Browser Support
Browser	Status
Chrome / Edge (last 2 versions)	✅ Fully supported
Firefox (last 2 versions)	✅ Fully supported
Safari 16+	✅ Fully supported
Mobile Chrome / Safari	✅ Supported (touch drag included)
Requires a browser with IntersectionObserver, Pointer Events, and color-mix() gracefully degrading where absent.

Performance
Workload	Expected behavior
1–10 PDFs, < 100 pages	Near-instant
10–20 PDFs, 100–300 pages	Smooth; thumbnails stream in, merge stays responsive
Very large files	Progressive rendering with progress feedback; 200 MB per-file hard limit, warning above 50 MB
Troubleshooting
The download doesn't start.Use the open the PDF in a new tab link in the success dialog and save with Ctrl/⌘ + S. If you're running the app inside a sandboxed preview (some online editors or embedded iframes), downloads are blocked by the environment itself — open index.html directly in a browser tab instead.

A large PDF renders slowly.That's expected above ~150 total pages — rendering resolution is automatically reduced and thumbnails stream in as you scroll. Switch thumbnails to S for the fastest experience with very large documents.

"This PDF is password-protected."Password-protected files can't be merged. Remove the password (re-save via any PDF viewer) and add the file again.

Libraries failed to load.The CDN wasn't reachable. Check your connection, or self-host the libraries (see Getting Started).

Roadmap
Phase 2 — Page rotation · Split PDF · Extract pages · Compress · Add blank page · Cover page · Page search

Phase 3 — ANTROR PDF Workspace — Merge, split, compress, extract, rotate, reorder, watermark, protect, convert, annotate: the merger becomes the first module of a complete document toolkit.

License
Released under the MIT License. The bundled libraries (PDF.js, pdf-lib) remain under their own licenses.

ANTROR / PDF MergerQuestions or bug reports → support@antror.com
