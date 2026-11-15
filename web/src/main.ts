import { mount } from 'svelte';
// Bundled with the app, so the UI makes no requests beyond the clack server.
import '@fontsource/lato/400.css';
import '@fontsource/lato/400-italic.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/900.css';
import './app.css';
// Importing the theme applies it, so the first thing drawn is already in the chosen colours.
import './lib/theme.svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
