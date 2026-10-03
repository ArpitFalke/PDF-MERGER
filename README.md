<h1 align="center">ANTROR TOOLS</h1>
<h3 align="center">Zero-Upload File Toolkit — Runs Entirely in the Browser</h3>

<p align="center">
  A lightweight, serverless collection of everyday file tools built on one principle: your files never touch a server. Merge PDFs with full page-level arrangement, convert images into PDFs, erase image watermarks with diffusion inpainting, and clean static video watermarks frame-by-frame — all processed locally with vanilla JavaScript. No accounts, no uploads, no backend.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="Vanilla JS"/>
  <img src="https://img.shields.io/badge/PDF.js-Rendering-E23237?style=for-the-badge&logo=mozilla&logoColor=white" alt="PDF.js"/>
  <img src="https://img.shields.io/badge/pdf-lib-Assembly-00A4CC?style=for-the-badge" alt="pdf-lib"/>
  <img src="https://img.shields.io/badge/Architecture-100%25_Local-2EA44F?style=for-the-badge" alt="100% Local"/>
  <img src="https://img.shields.io/badge/Backend-None-000000?style=for-the-badge" alt="No Backend"/>
  <img src="https://img.shields.io/badge/Deployment-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
</p>

---

## The Mission: Files That Never Leave the Device

Standard online file tools — PDF mergers, watermark removers, converters — all share the same architecture: your file is uploaded to someone else's server, processed there, and sent back. That means privacy risk, upload queues, file size limits, and a company that technically handled your legal, financial, or personal documents.

ANTROR Tools inverts the model. Every tool runs inside the browser sandbox using local compute: PDF.js renders pages, pdf-lib assembles documents, the Canvas API performs inpainting and image embedding, and MediaRecorder re-encodes video on-device. The server count is zero — because zero are needed.

The flagship module is a **PDF Merger built like a lightweight document editor**, not a basic upload utility. It gives users exact control over *which* pages from each PDF enter the final document and *exactly* where they appear — then an Image to PDF converter and Image & Video Watermark Removers join the suite under the same design system and the same privacy guarantee.

| Module | Route | Input → Output |
|---|---|---|
| **PDF Merger** | `/merge` | Multiple PDFs → single PDF, exact page order |
| **Image Watermark Remover** | `/image-watermark` | JPG / PNG / WebP → cleaned PNG / JPG |
| **Video Watermark Remover** | `/video-watermark` | MP4 / WebM → cleaned MP4 / WebM |
| **Image to PDF** | `/image-to-pdf` | JPG / PNG / WebP / BMP → single multi-page PDF |

---

## Features & Engineering Decisions

### PDF Merger

* **Decoupled Selection ⇄ Sequence Data Model:** 
  The most important architectural decision in the app. Per-document selection state (`Set` of page numbers) is stored *separately* from the final merge order (an array of `{docId, pageNumber}` entries). Selecting a page appends it to the sequence; dragging rows, duplicating, inserting, or removing only ever touches the sequence — never selection. This separation is what makes interleaved orders like `A-1, B-4, A-7, C-1` and intentional page duplication safe and predictable.
* **Full Page Arrangement Engine:** 
  A shared pointer-based sortable handles both mouse and touch with edge auto-scroll, a dragged ghost, and a drop placeholder. Rows support insert-before/after from any loaded document, duplication (for repeated forms), and removal — where removing from the sequence never mutates the original PDF. Keyboard alternatives (`Alt+↑/↓`, `Home`, `End`, `Delete`) mirror every drag operation.
* **Range DSL with Adversarial Validation:** 
  The range parser accepts `1-3, 7, 10-12` and rejects every failure mode with a specific, human message — reversed ranges get a correction suggestion (`5-2` → "try 2-5"), out-of-bounds pages report the document's real page count, and garbage tokens are quoted back. No generic errors anywhere.
* **Lazy Thumbnail Pipeline:** 
  An `IntersectionObserver` queues renders only for pages near the viewport, drained by a bounded queue (max 5 concurrent renders). Results cache per page/zoom, device-pixel-ratio caps degrade automatically above 150 and 300 total pages, and a canvas pixel ceiling prevents memory exhaustion on huge documents. S/M/L zoom re-renders only what's visible.
* **Snapshot-Based Undo/Redo:** 
  Every mutation calls `History.capture()` first, pushing a lightweight snapshot of order + selection + sequence (capped at 100 steps). `Ctrl+Z` / `Ctrl+Y` restore any workspace action — including "Undo" for deleting an entire uploaded PDF via a toast action.
* **UI-Thread-Yielding Merge:** 
  The merge loop copies one page at a time and yields via `requestAnimationFrame`, so a 300-page merge never freezes the tab. Progress runs through visible stages (Preparing → Processing → Building) with per-stage metrics and a working Cancel button.

### Image Watermark Remover

* **Smart Fill (Diffusion Inpainting):** 
  Marked regions aren't just blurred — they're reconstructed. Each region initializes from a bilinear blend of its surrounding boundary pixels, then runs iterative diffusion passes until the fill settles. Computation happens on a downscaled copy (160k px working cap) since the result is smooth, making the upscale invisible while keeping large regions fast.
* **Three Removal Modes, One Engine:** 
  Smart fill for plain/soft backgrounds, blur (downscale-upscale inside a clip), and pixelate — switchable per session before running. All modes operate through the same clamped-rect pipeline.
* **Normalized Region Editor:** 
  Boxes are stored as percentage coordinates, so regions survive any canvas size or zoom. Users draw unlimited boxes, delete individual boxes via a hover control, undo the last box, or cancel a half-drawn box with `Esc`.

### Video Watermark Remover

* **Real-Time Frame Pipeline:** 
  No frame extraction, no ffmpeg.wasm payload. The video plays through once while a `requestVideoFrameCallback` loop (with `requestAnimationFrame` fallback) draws each frame to a canvas, applies the chosen fill mode to every marked region, and pushes the canvas into `captureStream(30)`. MediaRecorder records the cleaned stream directly.
* **Zero-Copy Audio Graph:** 
  A Web Audio `MediaElementSource` routes the source video's audio to both a `MediaStreamDestination` (mixed into the recording) and the speakers (preview stays audible) — so the output keeps its original audio track without a second decode pass.
* **Codec Negotiation:** 
  A `MediaRecorder.isTypeSupported` cascade prefers H.264 MP4 and falls back through VP9/VP8 WebM. The file extension follows the negotiated mime, so users never receive a mislabeled file.
* **Honest Cost Model:** 
  On-device re-encoding runs in real time by design — a 2:00 video takes ~2:00 to process. The app states this up front, confirms before processing videos over 2:30, streams live progress with a time counter, and supports mid-run cancellation that discards cleanly.
* **Memory Hygiene:** 
  Object URLs for sources and results are tracked and revoked on replace/reset, recorder chunks are released after blob assembly, and the audio context is created once per element and reused.

### Image to PDF

* **Native Embedding Where Possible:** 
  JPEG and PNG files are embedded by pdf-lib byte-for-byte with zero re-encoding. WebP, BMP, GIF, and AVIF are decoded locally via Canvas and re-embedded as PNG — preserving transparency.
* **Page Geometry Engine:** 
  Auto mode sizes each page exactly to its image; A4/Letter modes add portrait/landscape orientation and three margin levels, centering each image with aspect-preserving fit. Margins auto-disable in Auto mode where they'd be meaningless.
* **Page Order as Drag-and-Drop:** 
  Image cards reuse the platform's shared sortable engine, so page reordering works with mouse and touch out of the box — one implementation, two tools.
* **Inline PDF Preview:** 
  The generated document renders in an iframe from a local blob URL before download, with rename support — the same download pattern as the merger.

### Platform Core

* **Path-Based Router Without a Framework:** 
  Real URLs (`/merge`, `/image-to-pdf`) served by a single `vercel.json` rewrite to the SPA shell, with `history.pushState` navigation, working browser back button, and per-route document titles. Every tool is deep-linkable, shareable, and refresh-safe.
* **Self-Registering Tool Architecture:** 
  Each tool lives in its own file and registers its route on load (`ROUTES['merge'] = {...}`). Adding a new tool = one new JS file + one `<script>` tag + one view section. Nothing else changes — no router edits, no core modifications.
* **Dependency-Ordered Script Pipeline:** 
  `core.js` (UI kit, router, sortable) → tool files → `app.js` (boot, always last). Plain script tags, no bundler, no transpiler — and it still runs by double-clicking `index.html`.
* **Scoped Interactions:** 
  Global keyboard shortcuts (`Ctrl+O`, `Ctrl+A`, `Ctrl+Z`) and the window-level file drop target only activate while the merger route is active — preventing cross-tool accidents like dropping a video into a PDF workspace.
* **Per-Route SEO:** 
  Each route swaps `<title>` and meta description at runtime; crawlable `<a href="/tool">` navigation and WebSite structured data ship in the initial HTML; `sitemap.xml` and `robots.txt` declare all five indexable URLs.
* **Theme Persistence Without Flash:** 
  An inline pre-paint script reads the stored theme from `localStorage` and applies it before first render, eliminating the light/dark flash on load. It's the only key the app ever stores.

---

## Architecture

GitHub natively supports Mermaid.js diagrams. Below is the visual map of the routing layer and the two most complex processing pipelines:

**Routing & PDF Merge Pipeline**

```mermaid
flowchart TD
    A[Request: / /merge /image-to-pdf...] --> B[Vercel Rewrite: All Paths Serve index.html]
    B --> C[App Boot: core.js then Tools then app.js]
    C --> D{Router Reads pathname}
    D --> E[Toggle View + Swap Title / Description]
    E --> F[Upload: Button / Drop / Multi-Select]
    F --> G{Validate}
    G -->|Invalid / Duplicate / Oversized| H[Specific Error Toast]
    G -->|OK| I[Render Lazy Thumbnails]
    I --> J[Select Pages: Click / All / Invert / Range]
    J --> K[Arrange: Drag / Insert / Duplicate / Remove]
    K --> L{Preview Approved?}
    L -->|No| K
    L -->|Yes| M[Staged Merge: Prep > Process > Build]
    M --> N[Blob URL: Rename + Download / Open in Tab]
```

**Video Watermark Processing Pipeline**

```mermaid
flowchart TD
    A[Add Video] --> B{Decodes Locally?}
    B -->|No| C[Codec Error Toast]
    B -->|Yes| D[Draw Region on Any Frame]
    D --> E[Start Processing]
    E --> F[Web Audio Graph: Source > Dest + Speakers]
    F --> G[captureStream 30fps + Audio Track]
    G --> H[MediaRecorder Start]
    H --> I{Frame Available?}
    I -->|rVFC Loop| J[Draw Frame to Canvas]
    J --> K[Apply Smart Fill / Blur / Pixel per Region]
    K --> L{Ended or Cancelled?}
    L -->|No| I
    L -->|Cancelled| M[Discard Chunks + Restore Editor]
    L -->|Ended| N[Stop Recorder + Assemble Blob]
    N --> O[Negotiate Extension: mp4 / webm]
    O --> P[Preview + Download]
```

---

## How to Deploy and Use

This application is 100% client-side with no build step. Deploy by pushing the repository to GitHub and importing it into Vercel — the included `vercel.json` handles the SPA rewrites automatically — or just open `index.html` directly in a browser.

```text
antror/
├── index.html              # SPA shell: all tool views, SEO tags, structured data
├── vercel.json             # rewrite: every path serves index.html
├── robots.txt              # crawl rules + sitemap pointer
├── sitemap.xml             # all five indexable URLs
├── assets/
│   └── logo.svg            # brand mark
├── css/
│   └── style.css           # design tokens (light/dark) + all component styles
└── js/                     # dependency-ordered, one file per tool
    ├── core.js             # shared: helpers, icons, router, modal, toast, sortable
    ├── pdf-merger.js       # PDF Merger
    ├── media-tools.js      # shared engine: RegionEditor + fill modes
    ├── image-watermark.js  # Image Watermark Remover
    ├── video-watermark.js  # Video Watermark Remover
    ├── image-to-pdf.js     # Image to PDF
    ├── legal.js            # footer legal pages
    └── app.js              # boot — always loaded LAST
```

> The two PDF libraries and fonts load from CDNs on first load. For fully offline use, download `pdf.min.js`, `pdf.worker.min.js`, and `pdf-lib.min.js` into a `vendor/` folder and update the references in `index.html` and `js/pdf-merger.js`.

### 1. PDF Merger
1. Open `/merge` and add PDFs via the button or drag & drop.
2. Select pages by clicking thumbnails, using **All / Invert / Clear**, or typing ranges like `1-3, 7, 10-12` under **Range…**
3. Arrange the **Merge Sequence** panel: drag rows into the exact final order, or use the row actions to insert, duplicate, or remove pages.
4. Hit **Preview** to review the full planned order, then **Merge PDFs**.
5. Rename the output if needed and download — the final PDF contains exactly the shown pages in exactly the shown order.

### 2. Image Watermark Remover
1. Open `/image-watermark` and add a JPG, PNG or WebP.
2. Drag a box over each watermark — as many boxes as needed.
3. Choose a mode: **Smart fill** (reconstructs the background), **Blur**, or **Pixelate**.
4. Click **Remove watermark**, compare Original vs Cleaned, then download.

### 3. Video Watermark Remover
1. Open `/video-watermark` and add an MP4 or WebM.
2. Pause on any frame and drag a box over the static watermark.
3. Click **Remove watermark** — processing plays the video once in real time (~the video's own duration) with live progress.
4. Preview the cleaned result and download as MP4 (or WebM, depending on your browser's encoder). Audio is preserved.

### 4. Image to PDF
1. Open `/image-to-pdf` and add any number of images.
2. Drag the cards to set the page order — the first card becomes page 1.
3. Pick a page size (**Auto / A4 / Letter**), orientation, and margin.
4. Click **Create PDF**, preview inline, rename, and download.

### Session Management
* **Undo / Redo:** `Ctrl+Z` / `Ctrl+Y` revert any merger action, including PDF removal and clearing the workspace.
* **Clear All:** wipes all uploads and selections after a confirmation — original files on disk are never touched by any tool.
* **Theme:** the sun/moon toggle persists between visits.
* **Keyboard:** `Ctrl+O` add PDFs · `Ctrl+A` select all · `Delete` remove active sequence row · `Esc` close dialogs.

---

## Tech Stack

* **PDF.js (Mozilla):** Local rendering of PDF pages to canvas thumbnails, with lazy loading and per-zoom caching.
* **pdf-lib:** Serverless PDF assembly — page-by-page copying for the merger, native JPG/PNG embedding for Image to PDF.
* **Canvas 2D API:** Diffusion-inpainting "smart fill", clipped blur, and pixelate modes; local format conversion for WebP/BMP/GIF.
* **MediaRecorder + captureStream:** Real-time on-device video re-encoding with a negotiated H.264/VP9/VP8 codec cascade.
* **Web Audio API:** MediaElement source graph that preserves the original audio track in recorded output while keeping preview audible.
* **History API + Vercel Rewrites:** Path-based SPA routing without a framework — real URLs, deep links, refresh-safe.
* **Vanilla JavaScript:** Zero frameworks. Eight dependency-ordered files with self-registering tools — raw, optimized JS.
* **Vanilla CSS:** Custom light/dark design system with CSS variables, `color-mix()` translucent chrome, and responsive layouts.
* **Web APIs:** `IntersectionObserver` (lazy thumbnails), Pointer Events (touch drag), `localStorage` (theme key only — never file data).
