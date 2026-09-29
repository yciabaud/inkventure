import { render } from 'preact';
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-700.css';
import '@fontsource/source-sans-3/latin-400.css';
import { App } from './app/App';
import { installTestHook } from './app/testHook';
import { initLocale } from './i18n/locale';
import { getStore } from './storage';
import './styles/base.css';
import './styles/ui.css';

initLocale(getStore());
installTestHook();

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
