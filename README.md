ANTROR TOOLS
Zero-Upload File Toolkit — Runs Entirely in the Browser
A lightweight, serverless collection of everyday file tools built on one principle: your files never touch a server. Merge PDFs with page-level arrangement control, convert images into PDFs, erase image watermarks with diffusion inpainting, and clean static video watermarks frame-by-frame — all processed locally with vanilla JavaScript. No accounts, no uploads, no backend.

Vanilla JSPDF.jspdf-lib100% LocalVercel

The Mission: Files That Never Leave the Device
Standard online file tools — PDF mergers, converters, watermark removers — all share the same architecture: your file is uploaded to someone else's server, processed there, and sent back. That means privacy risk, upload queues, file size limits, and a company that technically handled your legal, financial, or personal documents.

ANTROR Tools inverts the model. Every tool runs inside the browser sandbox using local compute: PDF.js renders pages, pdf-lib assembles documents, the Canvas API performs inpainting and image embedding, and MediaRecorder re-encodes video on-device. The server count is zero — because zero are needed.

The flagship module is a PDF Merger built like a lightweight document editor, not a basic upload utility. It gives users exact control over which pages from each PDF enter the final document and exactly where they appear. Around it, three more tools share one design system, one engine layer, and one privacy guarantee.

Module	URL	Input → Output
PDF Merger	/merge	Multiple PDFs → single PDF, exact page order
Image Watermark Remover	/image-watermark	JPG / PNG / WebP → cleaned PNG / JPG
Video Watermark Remover	/video-watermark	MP4 / WebM → cleaned MP4 / WebM
Image to PDF	/image-to-pdf	JPG / PNG / WebP / BMP → single multi-page PDF
Features & Engineering Decisions
PDF Merger
Decoupled Selection ⇄ Sequence Data Model: The most important architectural decision in the app. Per-document selection state (Set of page numbers) is stored separately from the final merge order (an array of {docId, pageNumber} entries). Selecting a page appends it to the sequence; dragging rows, duplicating, inserting, or removing only ever touches the sequence — never selection. This separation is what makes interleaved orders like A-1, B-4, A-7, C-1 and intentional page duplication safe and predictable.
Full Page Arrangement Engine: A shared pointer-based sortable handles mouse and touch with edge auto-scroll, a dragged ghost, and a drop placeholder. Rows support insert-before/after from any loaded document, duplication, and removal — where removing from the sequence never mutates the original PDF. Keyboard alternatives (Alt+↑/↓, Home, End, Delete) mirror every drag operation.
Range DSL with Adversarial Validation: The range parser accepts 1-3, 7, 10-12 and rejects every failure mode with a specific, human message — reversed ranges get a correction suggestion (5-2 → "try 2-5"), out-of-bounds pages report the document's real page count, and garbage tokens are quoted back.
Lazy Thumbnail Pipeline: An IntersectionObserver queues renders only for pages near the viewport, drained by a bounded queue (max 5 concurrent). Results cache per page/zoom, device-pixel-ratio caps degrade above 150 and 300 total pages, and a canvas pixel ceiling prevents memory exhaustion on huge documents.
Snapshot-Based Undo/Redo: Every mutation captures a lightweight snapshot of order + selection + sequence (capped at 100 steps). Ctrl+Z / Ctrl+Y restore any workspace action — including "Undo" for deleting an entire uploaded PDF via a toast action.
UI-Thread-Yielding Merge: The merge loop copies one page at a time and yields via requestAnimationFrame, so a 300-page merge never freezes the tab. Progress runs through visible stages (Preparing → Processing → Building) with a working Cancel button.
Image Watermark Remover
Smart Fill (Diffusion Inpainting): Marked regions aren't just blurred — they're reconstructed. Each region initializes from a bilinear blend of its surrounding boundary pixels, then runs iterative diffusion passes until the fill settles. Computation happens on a downscaled copy (160k px working cap) since the result is smooth, making the upscale invisible while keeping large regions fast.
Three Removal Modes, One Engine: Smart fill for plain/soft backgrounds, blur, and pixelate — switchable per session. All modes operate through the same clamped-rect pipeline.
Normalized Region Editor: Boxes are stored as percentage coordinates, so regions survive any canvas size or zoom. Unlimited boxes, per-box delete, undo, and Esc to cancel a half-drawn box.
Video Watermark Remover
Real-Time Frame Pipeline: No frame extraction, no ffmpeg.wasm payload. The video plays through once while a requestVideoFrameCallback loop draws each frame to a canvas, applies the chosen fill mode to every marked region, and pushes the canvas into captureStream(30). MediaRecorder records the cleaned stream directly.
Zero-Copy Audio Graph: A Web Audio MediaElementSource routes the source audio to both a MediaStreamDestination (mixed into the recording) and the speakers (preview stays audible) — the output keeps its original audio track without a second decode pass.
Codec Negotiation: A MediaRecorder.isTypeSupported cascade prefers H.264 MP4 and falls back through VP9/VP8 WebM. The file extension follows the negotiated mime, so users never receive a mislabeled file.
Honest Cost Model: On-device re-encoding runs in real time by design — a 2:00 video takes ~2:00 to process. The app states this up front, confirms before processing videos over 2:30, streams live progress, and supports mid-run cancellation.
Image to PDF
Native Embedding Where Possible: JPEG and PNG files are embedded by pdf-lib byte-for-byte with zero re-encoding. WebP, BMP, GIF, and AVIF are decoded locally via <img> + Canvas and re-embedded as PNG — preserving transparency.
Page Geometry Engine: Auto mode sizes each page exactly to its image; A4/Letter modes add portrait/landscape orientation and three margin levels, centering each image with aspect-preserving fit. Margins auto-disable in Auto mode where they'd be meaningless.
Page Order as Drag-and-Drop: Image cards reuse the platform's shared sortable engine, so page reordering works with mouse and touch out of the box — one implementation, two tools.
Inline PDF Preview: The generated document renders in an iframe from a local blob URL before download, with rename support — same download pattern as the merger.
Platform Core
Path-Based Router, Zero Framework: Real URLs (/merge, /image-to-pdf) served by a single vercel.json rewrite to the SPA shell, with history.pushState navigation, working browser back button, and per-route document titles. Every tool is deep-linkable, shareable, and refresh-safe.
Self-Registering Tool Architecture: Each tool lives in its own file and registers its route on load (ROUTES['merge'] = {...}). Adding a new tool = one new JS file + one <script> tag + one view section. Nothing else changes — no router edits, no core modifications.
Dependency-Ordered Script Pipeline: core.js (UI kit, router, sortable) → tool files → app.js (boot, always last). Plain script tags, no bundler, no transpiler — and it still runs by double-clicking index.html.
Per-Route SEO: Each route swaps <title> and meta description at runtime; crawlable <a href="/tool"> navigation and WebSite structured data ship in the initial HTML; sitemap.xml and robots.txt declare all five indexable URLs.
Theme Persistence Without Flash: An inline pre-paint script applies the stored theme before first render. It's the only key the app ever stores — no file data, no analytics, no cookies.
Architecture
GitHub natively supports Mermaid.js diagrams. Below are the platform router and the two most complex processing pipelines:

Routing & PDF Merge Pipeline

flowchart TD    A[Request: / /merge /image-to-pdf...] --> B[Vercel Rewrite: All Paths to index.html]    B --> C[App Boot: core.js then Tools then app.js]    C --> D{Router Reads pathname}    D --> E[Toggle View Section + Swap Title/Description]    E --> F[Merger: Upload Button / Drop / Multi-Select]    F --> G{Validate}    G -->|Invalid / Duplicate / Oversized| H[Specific Error Toast]    G -->|OK| I[Lazy Thumbnails via IntersectionObserver]    I --> J[Select: Click / All / Invert / Range]    J --> K[Arrange: Drag / Insert / Duplicate / Remove]    K --> L{Preview Approved?}    L -->|No| K    L -->|Yes| M[Staged Merge: Prep > Process > Build]    M --> N[Blob URL: Rename + Download / Open in Tab]
Video Watermark Processing Pipeline

flowchart TD    A[Add Video] --> B{Decodes Locally?}    B -->|No| C[Codec Error Toast]    B -->|Yes| D[Draw Region on Any Frame]    D --> E[Start Processing]    E --> F[Web Audio Graph: Source > Dest + Speakers]    F --> G[captureStream 30fps + Audio Track]    G --> H[MediaRecorder Start]    H --> I{Frame Available?}    I -->|rVFC Loop| J[Draw Frame to Canvas]    J --> K[Apply Smart Fill / Blur / Pixel per Region]    K --> L{Ended or Cancelled?}    L -->|No| I    L -->|Cancelled| M[Discard Chunks + Restore Editor]    L -->|Ended| N[Stop Recorder + Assemble Blob]    N --> O[Negotiate Extension: mp4 / webm]    O --> P[Preview + Download]
How to Deploy and Use
This application is 100% client-side with no build step. Deploy by pushing the repository to GitHub and importing it into Vercel — the included vercel.json handles the SPA rewrites automatically. Locally, just open index.html in a browser.

antror/├── index.html              # SPA shell: all tool views, SEO tags, structured data├── vercel.json             # rewrite: every path serves index.html├── robots.txt              # crawl rules + sitemap pointer├── sitemap.xml             # all five indexable URLs├── assets/│   └── logo.svg            # brand mark├── css/│   └── style.css           # design tokens (light/dark) + all component styles└── js/                     # dependency-ordered, one file per tool    ├── core.js             # shared: helpers, icons, router, modal, toast, sortable    ├── pdf-merger.js       # PDF Merger    ├── media-tools.js      # shared engine: RegionEditor + fill modes    ├── image-watermark.js  # Image Watermark Remover    ├── video-watermark.js  # Video Watermark Remover    ├── image-to-pdf.js     # Image to PDF    ├── legal.js            # footer legal pages    └── app.js              # boot — always loaded LAST
The two PDF libraries and fonts load from CDNs on first load. For fully offline use, download pdf.min.js, pdf.worker.min.js, and pdf-lib.min.js into a vendor/ folder and update the references in index.html and js/pdf-merger.js.

1. PDF Merger
Open /merge and add PDFs via the button or drag & drop.
Select pages by clicking thumbnails, using All / Invert / Clear, or typing ranges like 1-3, 7, 10-12 under Range…
Arrange the Merge Sequence panel: drag rows into the exact final order, or use row actions to insert, duplicate, or remove pages.
Hit Preview to review the full planned order, then Merge PDFs.
Rename the output if needed and download — the final PDF contains exactly the shown pages in exactly the shown order.
2. Image Watermark Remover
Open /image-watermark and add a JPG, PNG, or WebP.
Drag a box over each watermark — as many boxes as needed.
Choose a mode: Smart fill (reconstructs the background), Blur, or Pixelate.
Click Remove watermark, compare Original vs Cleaned, then download.
3. Video Watermark Remover
Open /video-watermark and add an MP4 or WebM.
Pause on any frame and drag a box over the static watermark.
Click Remove watermark — processing plays the video once in real time (~the video's own duration) with live progress.
Preview the cleaned result and download as MP4 (or WebM, depending on your browser's encoder). Audio is preserved.
4. Image to PDF
Open /image-to-pdf and add any number of images.
Drag the cards to set the page order — the first card becomes page 1.
Pick a page size (Auto / A4 / Letter), orientation, and margin.
Click Create PDF, preview inline, rename, and download.
Session Management
Undo / Redo: Ctrl+Z / Ctrl+Y revert any merger action, including PDF removal and clearing the workspace.
Clear All: wipes all uploads and selections after a confirmation — original files on disk are never touched by any tool.
Theme: the sun/moon toggle persists between visits.
Keyboard: Ctrl+O add PDFs · Ctrl+A select all · Delete remove active sequence row · Esc close dialogs.
Privacy
This toolkit is built so that it cannot leak your files, because it never receives them:

You → Browser (PDF.js / pdf-lib / Canvas / MediaRecorder) → Output file → Download
No uploads, no server, no analytics, no cookies, no accounts.
Everything lives in memory; closing the tab discards all files and results.
Exactly one thing is stored in localStorage: your theme preference (antror-theme).
File binaries are never persisted anywhere.
Full details are in the in-app Privacy Policy (footer).

Tech Stack
PDF.js (Mozilla): Local rendering of PDF pages to canvas thumbnails, with lazy loading and per-zoom caching.
pdf-lib: Serverless PDF assembly — page-by-page copying for the merger, native JPG/PNG embedding for Image to PDF.
Canvas 2D API: Diffusion-inpainting "smart fill", clipped blur, and pixelate modes; local format conversion for WebP/BMP/GIF.
MediaRecorder + captureStream: Real-time on-device video re-encoding with an H.264/VP9/VP8 codec cascade.
Web Audio API: MediaElement source graph that preserves original audio in recorded output while keeping preview audible.
History API + Vercel Rewrites: Path-based SPA routing without a framework — real URLs, deep links, refresh-safe.
Vanilla JavaScript: Zero frameworks. Eight dependency-ordered files, self-registering tools, no bundler or transpiler.
Vanilla CSS: Custom light/dark design system with CSS variables, color-mix() translucent chrome, and responsive layouts.
Web APIs: IntersectionObserver (lazy thumbnails), Pointer Events (touch drag), localStorage (theme key only — never file data).
Vercel: Static hosting with SPA rewrites; SEO infrastructure (sitemap.xml, robots.txt, structured data) included in the deploy.
