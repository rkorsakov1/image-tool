import { useApp } from '../state/AppContext';
import { LANGUAGES, type Messages } from './index';

/** The UI strings for the current language. Re-renders when the language changes. */
export const useT = (): Messages => LANGUAGES[useApp().state.prefs.language].messages;
