'use strict';
/* =====================================================================
   ANTROR boot — ALWAYS loaded LAST (after core + all tool files).
   ===================================================================== */
(function () {
  // theme (icon + stored preference)
  setTheme(document.documentElement.dataset.theme || 'light', false);
  $('#btnTheme').addEventListener('click', () =>
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  // first route render (all tools have registered their routes by now)
  applyRoute();

  // CDN library check
  if (typeof pdfjsLib === 'undefined' || typeof PDFLib === 'undefined') {
    toast('PDF libraries failed to load. Check your connection and refresh the page.', { type: 'error' });
  }
})();
