'use strict';
/* =====================================================================
   ANTROR — legal pages (footer)
   REQUIRES: core.js (Modal, btn, I, el, esc).
   ===================================================================== */
const LEGAL = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated — January 2025',
    body: `
      <div class="legal-hero">
        ${I.lock}
        <p><b>The short version:</b> everything happens in your browser. Your files are never uploaded, never transmitted, and never seen by anyone but you.</p>
      </div>
      <div class="legal-body">
        <h4>1. Your files never leave your device</h4>
        <p>Every ANTROR tool runs locally. PDFs are read into your browser's memory and merged with pdf-lib; images are edited with the Canvas API; videos are processed and re-encoded on your device with standard browser recording APIs. No part of this process transmits your files, file names, or their contents anywhere.</p>
        <p>Everything is held in memory only. When you close or refresh the tab, all files, selections, and generated documents are discarded.</p>
        <h4>2. What we store (and don't)</h4>
        <p>This site stores exactly one value in your browser's localStorage: the key <b>antror-theme</b>, which remembers whether you prefer the light or dark theme. It contains no personal information and no file data.</p>
        <h4>3. Cookies and tracking</h4>
        <p>We set no cookies and load no analytics, advertising, or fingerprinting scripts. There is nothing to opt out of.</p>
        <h4>4. Third-party resources</h4>
        <p>To stay lightweight, the site loads two open-source libraries (PDF.js and pdf-lib) and two typefaces from public CDNs when the page opens. Those requests go to the CDN operators, who receive standard technical request data such as your IP address — as with any web resource. Your documents are never part of these requests.</p>
        <p>For maximum privacy, you can download the libraries and host them alongside the site so that no external requests occur at all.</p>
        <h4>5. Your output files</h4>
        <p>Final documents are created in memory and handed directly to your browser's own download manager. We have no visibility into what you name them or where you save them.</p>
        <h4>6. Children's privacy</h4>
        <p>Because no personal information is collected from any user, nothing is knowingly collected from children under 13, or the equivalent minimum age in your region.</p>
        <h4>7. Changes to this policy</h4>
        <p>If this policy changes, the revised version will be posted on this page with an updated date.</p>
      </div>`
  },
  terms: {
    title: 'Terms & Conditions',
    updated: 'Last updated — January 2025',
    body: `
      <div class="legal-body">
        <h4>1. Acceptance of terms</h4>
        <p>By using ANTROR Tools (the "Service"), you agree to these Terms &amp; Conditions. If you do not agree, please do not use the Service.</p>
        <h4>2. What the Service is</h4>
        <p>ANTROR Tools is a collection of free, browser-based utilities — including a PDF merger, image to PDF conversion, and image/video watermark removal — that process files entirely on your device. The Service has no servers that receive your files.</p>
        <h4>3. Your files and your rights</h4>
        <ul>
          <li>You retain <b>full ownership</b> of every file you process. The Service claims no rights over your content — it never receives a copy.</li>
          <li>You are responsible for ensuring you have the right to modify the files you process: they must be yours, licensed to you, or handled with permission.</li>
          <li>Always keep your <b>original files</b>. The Service creates new documents and does not modify your sources.</li>
        </ul>
        <h4>4. Acceptable use</h4>
        <p>You agree to use the Service only for lawful purposes and only with content you are authorized to handle. You may not use the Service to infringe copyrights, remove watermarks from content you do not have rights to modify, breach confidentiality obligations, or process illegal material.</p>
        <h4>5. No warranty</h4>
        <p>The Service is provided <b>"as is" and "as available"</b>, without warranties of any kind, express or implied. Automated watermark removal is best-effort: results depend on the background behind each watermark. <b>Please verify your output before relying on it</b> — especially for legal, financial, medical, or official documents.</p>
        <h4>6. Limitation of liability</h4>
        <p>To the maximum extent permitted by law, ANTROR and its contributors will not be liable for any loss of data, corrupted files, missed deadlines, lost profits, or any indirect, incidental, or consequential damages arising from your use of — or inability to use — the Service.</p>
        <h4>7. Intellectual property</h4>
        <p>The ANTROR name, logo, and interface design are the property of ANTROR. The open-source libraries this site builds on (PDF.js, pdf-lib) remain the property of their respective authors under their own licenses. Your files remain yours alone.</p>
        <h4>8. Availability and changes</h4>
        <p>The Service is offered free of charge and may be modified, interrupted, or discontinued at any time. These Terms may be updated from time to time; continued use after changes constitutes acceptance.</p>
        <h4>9. Governing law</h4>
        <p>These Terms are governed by the laws of <b>[your jurisdiction]</b>, without regard to conflict-of-law rules.</p>
      </div>`
  },
  about: {
    title: 'About',
    updated: 'ANTROR / Tools',
    body: `
      <div class="legal-body">
        <p>ANTROR is a growing collection of small, focused file tools that run entirely in your browser — no accounts, no uploads, no servers processing your documents.</p>
        <p>Most online file tools upload your files for processing. These don't need to — so they don't. Pages render with PDF.js, documents assemble with pdf-lib, images edit with Canvas, and video is re-encoded on-device. Everything stays local.</p>
        <div class="legal-contact">
          <b>Current tools</b><br>
          PDF Merger · Image Watermark Remover · Video Watermark Remover · Image to PDF<br><br>
          <b>In development</b><br>
          Split PDF · Compress PDF · Rotate pages · Extract pages
        </div>
        <p><b>Version 1.2.0</b> — Image to PDF release. Built with HTML, CSS, and vanilla JavaScript. No frameworks, no backend, no tracking.</p>
      </div>`
  },
  contact: {
    title: 'Contact',
    updated: 'We usually reply within a few business days',
    body: `
      <div class="legal-body">
        <p>Questions, bug reports, and feature requests are all welcome.</p>
        <div class="legal-contact">
          <b>Email</b><br>
          <a href="mailto:support@antror.com">support@antror.com</a>
        </div>
        <h4>Reporting a bug</h4>
        <p>Please include your browser and version, your operating system, the tool you were using, the steps you took, and any error message shown. There is no need to attach confidential files — issues are almost always reproducible with any sample.</p>
        <h4>Feature requests</h4>
        <p>On the roadmap: PDF splitting, compression, rotation, and extraction. If something would make your workflow easier, tell us — the roadmap is shaped by what users actually need.</p>
      </div>`
  }
};
function openLegal(key) {
  const page = LEGAL[key];
  if (!page) return;
  const body = el('div');
  body.innerHTML = `<p class="legal-updated">${esc(page.updated)}</p>${page.body}`;
  let m;
  m = Modal.open({ title: page.title, body, width: 640, footer: [btn('Close', { onClick: () => m.close() })] });
}
 $('#siteFooter').addEventListener('click', e => {
  const b = e.target.closest('[data-legal]');
  if (b) openLegal(b.dataset.legal);
});
 $('#footYear').textContent = new Date().getFullYear();
