import { useEffect } from 'react';
import type { Theme } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import type { Language } from '../../i18n';
import { useT } from '../../i18n/useT';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const ICON: Record<Theme, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };
/** Browser chrome color per theme; matches --color-panel. */
const CHROME = { light: '#fafaf9', dark: '#181817' };

/** Puts the chosen theme on <html> (public/theme.js does the same before the first paint). */
export const useApplyTheme = (theme: Theme): void => {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      const media = meta.media.includes('dark') ? 'dark' : 'light';
      meta.content = CHROME[theme === 'system' ? media : theme];
    }
  }, [theme]);
};

/** Cycles System → Light → Dark. */
export const ThemeToggle = () => {
  const { state, dispatch } = useApp();
  const t = useT();
  const LABEL = t.app.theme;
  const theme = state.prefs.theme;
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] as Theme;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        dispatch({ type: 'setPref', patch: { theme: next } });
        dispatch({ type: 'announce', message: `${LABEL[next]}.` });
      }}
      aria-label={t.app.themeSwitch(LABEL[theme], LABEL[next])}
      title={t.app.themeTitle(LABEL[theme], LABEL[next])}
    >
      <Icon name={ICON[theme]} />
    </Button>
  );
};

/** Switches English ↔ Deutsch. Shows the current language; the URL follows (/de/). */
export const LanguageToggle = () => {
  const { state, dispatch } = useApp();
  const t = useT();
  const next: Language = state.prefs.language === 'de' ? 'en' : 'de';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => dispatch({ type: 'setPref', patch: { language: next } })}
      aria-label={t.app.languageSwitch}
      title={t.meta.switchTo}
      className="font-mono text-[11px] font-semibold tracking-wide"
    >
      <span aria-hidden="true">{t.meta.short}</span>
    </Button>
  );
};
