// Applies the saved theme before the first paint, so a forced light/dark theme doesn't flash.
// (A separate file because the Content-Security-Policy blocks inline scripts.)
try {
  const saved = JSON.parse(localStorage.getItem('localcrop:presets:v1') || '{}');
  const theme = saved && saved.prefs && saved.prefs.theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage unavailable: follow the system theme.
}
