// Standalone iOS PWAs may keep vh units unchanged while the keyboard is open.
// Track the visual viewport so the flex layout leaves the message composer visible.
(() => {
  const update = () => {
    const viewport = window.visualViewport;
    const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--visible-height', `${Math.round(height)}px`);
  };

  update();
  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('orientationchange', update, { passive: true });
  window.visualViewport?.addEventListener('resize', update, { passive: true });
  window.visualViewport?.addEventListener('scroll', update, { passive: true });
})();

