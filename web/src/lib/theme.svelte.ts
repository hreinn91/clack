// The look of the app: a set of colours picked from the presets below,
// optionally with some of them changed, plus the font and text size. The
// choice is remembered by the browser it was made in.

/** The colours a theme is made of. Everything else on screen is worked out from these. */
export type Colors = {
  /** Rail and top bar. */
  chrome: string;
  /** Sidebar. */
  side: string;
  /** Text on the rail, top bar and sidebar. */
  chromeText: string;
  /** The selected row in the sidebar, and the text on it. */
  active: string;
  activeText: string;
  /** The page behind messages. */
  bg: string;
  /** Cards, menus and the message box. */
  surface: string;
  text: string;
  muted: string;
  border: string;
  /** Buttons that send or confirm, and other small highlights. */
  accent: string;
  link: string;
  /** Inline code in messages. */
  code: string;
  danger: string;
  /** "Working", "added" and other good news. */
  ok: string;
  termBg: string;
  termFg: string;
};

export type Preset = Colors & {
  id: string;
  name: string;
  dark: boolean;
  /** The terminal's sixteen colours: black, red, green, yellow, blue, magenta, cyan, white, then their bright versions. */
  ansi: string[];
};

const TOMORROW = ['#1d1f21', '#cc6666', '#b5bd68', '#f0c674', '#81a2be', '#b294bb', '#8abeb7', '#c5c8c6', '#666666', '#d54e53', '#b9ca4a', '#e7c547', '#7aa6da', '#c397d8', '#70c0b1', '#eaeaea'];
const SOLARIZED = ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#586e75', '#cb4b16', '#859900', '#b58900', '#268bd2', '#6c71c4', '#2aa198', '#fdf6e3'];

export const PRESETS: Preset[] = [
  {
    id: 'aubergine',
    name: 'Aubergine',
    dark: false,
    chrome: '#48144a',
    side: '#592a5a',
    chromeText: '#f6dff9',
    active: '#fbedff',
    activeText: '#39063a',
    bg: '#ffffff',
    surface: '#ffffff',
    text: '#1d1c1d',
    muted: '#616061',
    border: '#dddddd',
    accent: '#007a5a',
    link: '#1264a3',
    code: '#c01343',
    danger: '#c01343',
    ok: '#2bac76',
    termBg: '#282c34',
    termFg: '#ffffff',
    ansi: TOMORROW,
  },
  {
    id: 'aubergine-dark',
    name: 'Aubergine Dark',
    dark: true,
    chrome: '#2c0d2e',
    side: '#3a1a3c',
    chromeText: '#f6dff9',
    active: '#fbedff',
    activeText: '#39063a',
    bg: '#1a1d21',
    surface: '#222529',
    text: '#d1d2d3',
    muted: '#ababad',
    border: '#35373b',
    accent: '#00805f',
    link: '#1d9bd1',
    code: '#e8912d',
    danger: '#f0688c',
    ok: '#2bac76',
    termBg: '#282c34',
    termFg: '#ffffff',
    ansi: TOMORROW,
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    dark: true,
    chrome: '#1b1f24',
    side: '#21252b',
    chromeText: '#abb2bf',
    active: '#3e4451',
    activeText: '#ffffff',
    bg: '#282c34',
    surface: '#2f343d',
    text: '#abb2bf',
    muted: '#7f848e',
    border: '#3e4451',
    accent: '#61afef',
    link: '#61afef',
    code: '#e06c75',
    danger: '#e06c75',
    ok: '#98c379',
    termBg: '#282c34',
    termFg: '#abb2bf',
    ansi: ['#3f4451', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf', '#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff'],
  },
  {
    id: 'dracula',
    name: 'Dracula',
    dark: true,
    chrome: '#191a21',
    side: '#21222c',
    chromeText: '#e9e9f4',
    active: '#bd93f9',
    activeText: '#1c1d26',
    bg: '#282a36',
    surface: '#343746',
    text: '#f8f8f2',
    muted: '#9ea8c7',
    border: '#44475a',
    accent: '#bd93f9',
    link: '#8be9fd',
    code: '#ff79c6',
    danger: '#ff5555',
    ok: '#50fa7b',
    termBg: '#282a36',
    termFg: '#f8f8f2',
    ansi: ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'],
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    dark: true,
    chrome: '#00212b',
    side: '#073642',
    chromeText: '#93a1a1',
    active: '#268bd2',
    activeText: '#fdf6e3',
    bg: '#002b36',
    surface: '#073642',
    text: '#93a1a1',
    muted: '#748b91',
    border: '#164b59',
    accent: '#2aa198',
    link: '#268bd2',
    code: '#cb4b16',
    danger: '#dc322f',
    ok: '#859900',
    termBg: '#002b36',
    termFg: '#839496',
    ansi: SOLARIZED,
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    dark: false,
    chrome: '#ddd6c1',
    side: '#eee8d5',
    chromeText: '#586e75',
    active: '#268bd2',
    activeText: '#fdf6e3',
    bg: '#fdf6e3',
    surface: '#fffbf0',
    text: '#586e75',
    muted: '#748689',
    border: '#e0d9c4',
    accent: '#2aa198',
    link: '#268bd2',
    code: '#d33682',
    danger: '#dc322f',
    ok: '#859900',
    termBg: '#fdf6e3',
    termFg: '#657b83',
    ansi: SOLARIZED,
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    dark: true,
    chrome: '#07070f',
    side: '#100e24',
    chromeText: '#b8eaff',
    active: '#fcee0a',
    activeText: '#0b0b17',
    bg: '#0b0b17',
    surface: '#15152b',
    text: '#e6f7ff',
    muted: '#8a94b8',
    border: '#2b2b55',
    accent: '#fcee0a',
    link: '#00e5ff',
    code: '#ff2a6d',
    danger: '#ff3860',
    ok: '#00ff9f',
    termBg: '#0b0b17',
    termFg: '#d7f9ff',
    ansi: ['#1c1c3a', '#ff2a6d', '#00ff9f', '#fcee0a', '#3d7bff', '#d300c5', '#00e5ff', '#d7f9ff', '#55558a', '#ff5c8d', '#5cffbf', '#fff56b', '#7aa5ff', '#ff4df2', '#6ff3ff', '#ffffff'],
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    dark: true,
    chrome: '#1a1626',
    side: '#241b2f',
    chromeText: '#e5d9ff',
    active: '#ff7edb',
    activeText: '#1a1626',
    bg: '#262335',
    surface: '#34294f',
    text: '#f4eeff',
    muted: '#b0a4d6',
    border: '#463c6a',
    accent: '#ff7edb',
    link: '#36f9f6',
    code: '#fede5d',
    danger: '#fe4450',
    ok: '#72f1b8',
    termBg: '#262335',
    termFg: '#f4eeff',
    ansi: ['#34294f', '#fe4450', '#72f1b8', '#fede5d', '#03edf9', '#ff7edb', '#36f9f6', '#f4eeff', '#614d85', '#fe4450', '#72f1b8', '#f3e70f', '#03edf9', '#ff7edb', '#03edf9', '#ffffff'],
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    dark: true,
    chrome: '#13131a',
    side: '#16161e',
    chromeText: '#a9b1d6',
    active: '#3d59a1',
    activeText: '#e6ecff',
    bg: '#1a1b26',
    surface: '#24283b',
    text: '#c0caf5',
    muted: '#8089b3',
    border: '#2f3549',
    accent: '#7aa2f7',
    link: '#7dcfff',
    code: '#ff9e64',
    danger: '#f7768e',
    ok: '#9ece6a',
    termBg: '#1a1b26',
    termFg: '#c0caf5',
    ansi: ['#32344a', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6', '#565f89', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'],
  },
  {
    id: 'nord',
    name: 'Nord',
    dark: true,
    chrome: '#20242c',
    side: '#272c36',
    chromeText: '#d8dee9',
    active: '#88c0d0',
    activeText: '#2e3440',
    bg: '#2e3440',
    surface: '#3b4252',
    text: '#e5e9f0',
    muted: '#9aa5b8',
    border: '#434c5e',
    accent: '#88c0d0',
    link: '#88c0d0',
    code: '#d08770',
    danger: '#bf616a',
    ok: '#a3be8c',
    termBg: '#2e3440',
    termFg: '#d8dee9',
    ansi: ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0', '#616e88', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4'],
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    dark: true,
    chrome: '#1d2021',
    side: '#282828',
    chromeText: '#d5c4a1',
    active: '#d79921',
    activeText: '#1d2021',
    bg: '#32302f',
    surface: '#3c3836',
    text: '#ebdbb2',
    muted: '#a89984',
    border: '#504945',
    accent: '#b8bb26',
    link: '#83a598',
    code: '#fe8019',
    danger: '#fb4934',
    ok: '#b8bb26',
    termBg: '#282828',
    termFg: '#ebdbb2',
    ansi: ['#3c3836', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984', '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2'],
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    dark: true,
    chrome: '#11111b',
    side: '#181825',
    chromeText: '#cdd6f4',
    active: '#cba6f7',
    activeText: '#1e1e2e',
    bg: '#1e1e2e',
    surface: '#313244',
    text: '#cdd6f4',
    muted: '#a6adc8',
    border: '#45475a',
    accent: '#cba6f7',
    link: '#89b4fa',
    code: '#fab387',
    danger: '#f38ba8',
    ok: '#a6e3a1',
    termBg: '#1e1e2e',
    termFg: '#cdd6f4',
    ansi: ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de', '#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8'],
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    dark: false,
    chrome: '#dce0e8',
    side: '#e6e9ef',
    chromeText: '#4c4f69',
    active: '#8839ef',
    activeText: '#ffffff',
    bg: '#eff1f5',
    surface: '#f9fafc',
    text: '#4c4f69',
    muted: '#6c6f85',
    border: '#ccd0da',
    accent: '#8839ef',
    link: '#1e66f5',
    code: '#fe640b',
    danger: '#d20f39',
    ok: '#40a02b',
    termBg: '#eff1f5',
    termFg: '#4c4f69',
    ansi: ['#5c5f77', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299', '#acb0be', '#6c6f85', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299', '#bcc0cc'],
  },
];

/** Stands for "Aubergine, light or dark as the device is set". */
export const AUTO = 'auto';

export const FONTS = [
  { value: 'lato', label: 'Lato', css: "Lato, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { value: 'system', label: 'System', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { value: 'serif', label: 'Serif', css: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif" },
  { value: 'mono', label: 'Monospace', css: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
];

export const SIZES = [
  { value: '14', label: 'Small' },
  { value: '15', label: 'Normal' },
  { value: '16', label: 'Large' },
  { value: '17', label: 'Larger' },
];

/** The colours people can change one by one, in the order the theme page lists them. */
export const COLOR_FIELDS: { key: keyof Colors; label: string; group: string }[] = [
  { key: 'chrome', label: 'Rail and top bar', group: 'Frame' },
  { key: 'side', label: 'Sidebar', group: 'Frame' },
  { key: 'chromeText', label: 'Text', group: 'Frame' },
  { key: 'active', label: 'Selected chat', group: 'Frame' },
  { key: 'activeText', label: 'Selected chat text', group: 'Frame' },
  { key: 'bg', label: 'Background', group: 'Page' },
  { key: 'surface', label: 'Cards and message box', group: 'Page' },
  { key: 'text', label: 'Text', group: 'Page' },
  { key: 'muted', label: 'Quiet text', group: 'Page' },
  { key: 'border', label: 'Lines', group: 'Page' },
  { key: 'accent', label: 'Buttons', group: 'Page' },
  { key: 'link', label: 'Links', group: 'Page' },
  { key: 'code', label: 'Inline code', group: 'Page' },
  { key: 'termBg', label: 'Background', group: 'Terminal' },
  { key: 'termFg', label: 'Text', group: 'Terminal' },
];

const KEY = 'clack.theme';

// ---- colour arithmetic ----------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `amount` of the way from one colour to another. */
function mix(from: string, to: string, amount: number): string {
  const a = rgb(from);
  const b = rgb(to);
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function alpha(hex: string, opacity: number): string {
  return `rgb(${rgb(hex).join(' ')} / ${Math.round(opacity * 100)}%)`;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const isLight = (hex: string) => luminance(hex) > 0.4;
/** Black or white, whichever reads better on a colour. */
const inkOn = (hex: string) => (luminance(hex) > 0.36 ? '#111111' : '#ffffff');

/** Every CSS variable the app uses, worked out from a theme's colours. */
function variables(c: Colors, dark: boolean): Record<string, string> {
  const chromeLight = isLight(c.chrome);
  const termLight = isLight(c.termBg);
  return {
    '--chrome': c.chrome,
    '--chrome-deep': mix(c.chrome, '#000000', chromeLight ? 0.05 : 0.14),
    '--side': c.side,
    '--side-deep': mix(c.side, '#000000', chromeLight ? 0.04 : 0.1),
    '--chrome-text': c.chromeText,
    '--chrome-strong': mix(c.chromeText, chromeLight ? '#000000' : '#ffffff', chromeLight ? 0.45 : 0.75),
    '--chrome-muted': mix(c.chromeText, c.side, 0.22),
    '--chrome-hover': alpha(c.chromeText, 0.1),
    '--chrome-field': alpha(c.chromeText, 0.16),
    '--chrome-tile': alpha(c.chromeText, 0.22),
    '--chrome-active': c.active,
    '--chrome-active-text': c.activeText,
    '--presence': c.ok,
    '--bg': c.bg,
    '--surface': c.surface,
    '--sunken': mix(c.bg, '#000000', dark ? 0.25 : 0.045),
    '--hover': mix(c.bg, c.text, 0.05),
    '--border': c.border,
    '--border-strong': mix(c.border, c.text, 0.35),
    '--text': c.text,
    '--muted': c.muted,
    '--accent': c.accent,
    '--accent-ink': inkOn(c.accent),
    '--accent-soft': mix(c.accent, c.bg, 0.82),
    '--link': c.link,
    '--code': c.code,
    '--danger': c.danger,
    '--danger-soft': mix(c.danger, c.bg, 0.85),
    '--add': mix(c.ok, c.bg, 0.82),
    '--del': mix(c.danger, c.bg, 0.85),
    '--shadow': dark ? '0 1px 2px rgb(0 0 0 / 30%), 0 8px 24px rgb(0 0 0 / 45%)' : '0 1px 2px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 10%)',
    '--term-bg': c.termBg,
    '--term-fg': c.termFg,
    '--term-strip': mix(c.termBg, '#000000', termLight ? 0.1 : 0.32),
    '--term-tab': mix(c.termBg, '#000000', termLight ? 0.05 : 0.16),
    '--term-dim': mix(c.termFg, c.termBg, 0.38),
    '--term-key': mix(c.termBg, c.termFg, 0.16),
  };
}

type Saved = { preset?: string; custom?: Partial<Colors>; font?: string; size?: string };

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (saved && typeof saved === 'object') return saved;
  } catch {
    // Nothing usable saved: start from the defaults.
  }
  return {};
}

class ThemeState {
  /** A preset's id, or AUTO. */
  preset = $state(AUTO);
  /** Colours changed by hand, on top of the preset. */
  custom = $state<Partial<Colors>>({});
  font = $state('lato');
  size = $state('15');
  /** Whether the device asks for dark colours, which is what AUTO follows. */
  #systemDark = $state(false);

  constructor() {
    const saved = load();
    if (saved.preset === AUTO || PRESETS.some((p) => p.id === saved.preset)) this.preset = saved.preset!;
    if (saved.custom && typeof saved.custom === 'object') this.custom = saved.custom;
    if (FONTS.some((f) => f.value === saved.font)) this.font = saved.font!;
    if (SIZES.some((s) => s.value === saved.size)) this.size = saved.size!;
    const query = matchMedia('(prefers-color-scheme: dark)');
    this.#systemDark = query.matches;
    query.addEventListener('change', (event) => {
      this.#systemDark = event.matches;
      this.#apply();
    });
    this.#apply();
  }

  /** The preset in force: for AUTO, whichever Aubergine suits the device right now. */
  get base(): Preset {
    const id = this.preset === AUTO ? (this.#systemDark ? 'aubergine-dark' : 'aubergine') : this.preset;
    return PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;
  }

  /** The colours on screen: the preset's, with the hand-picked ones over them. */
  get colors(): Colors {
    return { ...this.base, ...this.custom };
  }

  get customized(): boolean {
    return Object.keys(this.custom).length > 0;
  }

  /** The same colours in the shape the terminal emulator takes them. */
  get terminal() {
    const c = this.colors;
    const [black, red, green, yellow, blue, magenta, cyan, white, brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] =
      this.base.ansi;
    return {
      background: c.termBg,
      foreground: c.termFg,
      cursor: c.termFg,
      cursorAccent: c.termBg,
      selectionBackground: alpha(c.termFg, 0.28),
      black,
      red,
      green,
      yellow,
      blue,
      magenta,
      cyan,
      white,
      brightBlack,
      brightRed,
      brightGreen,
      brightYellow,
      brightBlue,
      brightMagenta,
      brightCyan,
      brightWhite,
    };
  }

  /** Switches preset. Colours changed by hand belonged to the old one, so they go. */
  choose(preset: string): void {
    this.preset = preset;
    this.custom = {};
    this.#apply();
  }

  setColor(key: keyof Colors, value: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    if (value.toLowerCase() === this.base[key].toLowerCase()) delete this.custom[key];
    else this.custom[key] = value;
    this.#apply();
  }

  /** Back to the preset as it comes. */
  reset(): void {
    this.custom = {};
    this.#apply();
  }

  setFont(font: string): void {
    this.font = font;
    this.#apply();
  }

  setSize(size: string): void {
    this.size = size;
    this.#apply();
  }

  #apply(): void {
    const style = document.documentElement.style;
    const dark = this.base.dark;
    for (const [name, value] of Object.entries(variables(this.colors, dark))) style.setProperty(name, value);
    style.setProperty('color-scheme', dark ? 'dark' : 'light');
    style.setProperty('--font', FONTS.find((f) => f.value === this.font)?.css ?? FONTS[0]!.css);
    style.setProperty('--text-size', `${this.size}px`);
    // The browser's own frame (a phone's status bar, an installed app's title bar) takes the rail's colour.
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = this.colors.chrome;
    try {
      const saved: Saved = { preset: this.preset, custom: $state.snapshot(this.custom), font: this.font, size: this.size };
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      // Not remembered this time; the look still changes.
    }
  }
}

export const theme = new ThemeState();

/** The CSS variables for a preset, for drawing a small picture of it. */
export function previewVariables(preset: Preset): Record<string, string> {
  return variables(preset, preset.dark);
}
