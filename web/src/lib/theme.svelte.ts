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
    id: 'cherry-blossom',
    name: 'Cherry Blossom',
    dark: false,
    chrome: '#ffb8cf',
    side: '#ffdae4',
    chromeText: '#42172e',
    active: '#793356',
    activeText: '#fff5f8',
    bg: '#fff4f6',
    surface: '#fffafb',
    text: '#3c2130',
    muted: '#735162',
    border: '#e5bdcd',
    accent: '#a82560',
    link: '#13625b',
    code: '#8b315d',
    danger: '#ab2938',
    ok: '#236746',
    termBg: '#fff7f9',
    termFg: '#3c2130',
    ansi: ['#32212e', '#97213e', '#226243', '#785119', '#354b80', '#853167', '#176165', '#f2dce4', '#6f5463', '#ab2045', '#176b48', '#865112', '#424f97', '#91236f', '#106467', '#fff9fc'],
  },
  {
    id: 'pink-moon-jelly',
    name: 'Pink Moon Jelly',
    dark: false,
    chrome: '#f3affc',
    side: '#ffd3ef',
    chromeText: '#391645',
    active: '#403b90',
    activeText: '#fff6ff',
    bg: '#fff3fc',
    surface: '#fffaff',
    text: '#31203c',
    muted: '#68516d',
    border: '#e3bde2',
    accent: '#6830a0',
    link: '#304b9b',
    code: '#98206e',
    danger: '#a62343',
    ok: '#14675a',
    termBg: '#291835',
    termFg: '#fce6ff',
    ansi: ['#382840', '#ff93ae', '#89e2be', '#ffc987', '#a2baff', '#efa1ff', '#7edce9', '#f4defa', '#bda4c8', '#ffadc8', '#a4edcd', '#ffdb9c', '#bac9ff', '#f9baff', '#9feaf3', '#fff5ff'],
  },
  {
    id: 'matcha-picnic',
    name: 'Matcha Picnic',
    dark: false,
    chrome: '#b5d581',
    side: '#e2edbd',
    chromeText: '#1b2a16',
    active: '#385a32',
    activeText: '#f8f5ce',
    bg: '#f9f8e9',
    surface: '#fffdf2',
    text: '#283324',
    muted: '#56634a',
    border: '#ced4ad',
    accent: '#934016',
    link: '#235e4b',
    code: '#794223',
    danger: '#a02e39',
    ok: '#37602a',
    termBg: '#f8f6e4',
    termFg: '#2b3726',
    ansi: ['#283324', '#96303c', '#305c2e', '#76501e', '#395780', '#7d3657', '#215e56', '#e6e7cf', '#515d49', '#a22e43', '#39632f', '#81521a', '#42538d', '#8a355c', '#24675f', '#fffdf2'],
  },
  {
    id: 'lime-zine',
    name: 'Lime Zine',
    dark: false,
    chrome: '#c9fa36',
    side: '#e1fc83',
    chromeText: '#172813',
    active: '#44318c',
    activeText: '#f7ffcc',
    bg: '#fbffe9',
    surface: '#fffff6',
    text: '#192820',
    muted: '#4d5c44',
    border: '#c7d6a5',
    accent: '#50329b',
    link: '#293e9b',
    code: '#783074',
    danger: '#a62337',
    ok: '#276234',
    termBg: '#192820',
    termFg: '#eeffbd',
    ansi: ['#24342a', '#ffa191', '#c6ef64', '#ffd477', '#9db9ff', '#dca8ff', '#79e3d5', '#eaf5d6', '#aec2ad', '#ffafa3', '#daff88', '#ffe096', '#b7ccff', '#e8c0ff', '#98f3e5', '#f8ffdf'],
  },
  {
    id: 'tidal-glass',
    name: 'Tidal Glass',
    dark: false,
    chrome: '#85e1d7',
    side: '#c3f2e9',
    chromeText: '#0f3036',
    active: '#155d69',
    activeText: '#effff9',
    bg: '#edfbf6',
    surface: '#f8fffc',
    text: '#193a42',
    muted: '#49666b',
    border: '#b6d9cf',
    accent: '#006777',
    link: '#205b8a',
    code: '#824071',
    danger: '#a52d42',
    ok: '#246840',
    termBg: '#effbf7',
    termFg: '#173a42',
    ansi: ['#173940', '#982e42', '#236143', '#78521b', '#215281', '#793d71', '#175c63', '#d6eae4', '#455e63', '#a72d49', '#216b49', '#835315', '#2d4e95', '#843476', '#0c6970', '#f4fffb'],
  },
  {
    id: 'cobalt-coast',
    name: 'Cobalt Coast',
    dark: false,
    chrome: '#173da0',
    side: '#124bb2',
    chromeText: '#f1f7ff',
    active: '#ffd69d',
    activeText: '#2d2450',
    bg: '#f3f8ff',
    surface: '#fbfdff',
    text: '#192f50',
    muted: '#4c607c',
    border: '#c0d3ec',
    accent: '#154ab2',
    link: '#0e5187',
    code: '#954126',
    danger: '#ad3048',
    ok: '#176b53',
    termBg: '#152b50',
    termFg: '#e8f5ff',
    ansi: ['#203650', '#ff9c88', '#83dfb9', '#ffd18a', '#9ebbff', '#d5b0ff', '#82dfea', '#e1efff', '#a9bed8', '#ffafa4', '#a1eccd', '#ffdea4', '#b7cdff', '#e6c5ff', '#9cecf5', '#f5faff'],
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    dark: true,
    chrome: '#071426',
    side: '#102944',
    chromeText: '#d0e8fc',
    active: '#79cee7',
    activeText: '#0b2539',
    bg: '#0b1c30',
    surface: '#132a42',
    text: '#e4f3ff',
    muted: '#9ebad1',
    border: '#31506b',
    accent: '#6cd1e8',
    link: '#9bbfff',
    code: '#8ee0cd',
    danger: '#ffa092',
    ok: '#7cddbb',
    termBg: '#071727',
    termFg: '#e0f1ff',
    ansi: ['#173047', '#ffa092', '#7cddbb', '#ffd494', '#9bbfff', '#c4b2f7', '#71cfe8', '#d1e8f7', '#8da9c0', '#ffc2b3', '#a3ecd3', '#ffe1ad', '#b7d1ff', '#dbc9ff', '#9ce9f9', '#f2faff'],
  },
  {
    id: 'forest-canopy',
    name: 'Forest Canopy',
    dark: true,
    chrome: '#0d2119',
    side: '#193529',
    chromeText: '#e0edce',
    active: '#b9db88',
    activeText: '#192e19',
    bg: '#141414',
    surface: '#1c372a',
    text: '#edf5e2',
    muted: '#abbea2',
    border: '#3f5c48',
    accent: '#b3d887',
    link: '#87d9c1',
    code: '#ecc68c',
    danger: '#ffad98',
    ok: '#8bd59d',
    termBg: '#0f231a',
    termFg: '#e8f2dc',
    ansi: ['#233b2c', '#ffad98', '#a6d792', '#ebcc89', '#9cc9df', '#dcb6da', '#87d9c1', '#e2edcf', '#a1b297', '#ffc5b5', '#c8e8a6', '#f5dfa5', '#b8dfef', '#f0c8e9', '#a6ebd5', '#f5fbe9'],
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    dark: true,
    chrome: '#16091f',
    side: '#1f0f2c',
    chromeText: '#e6d8f7',
    active: '#b57cff',
    activeText: '#16091f',
    bg: '#1c1226',
    surface: '#271a35',
    text: '#ece3f7',
    muted: '#a493bd',
    border: '#3a2a4f',
    accent: '#b57cff',
    link: '#7cc7ff',
    code: '#ff8fd8',
    danger: '#ff6b8b',
    ok: '#7cf0b0',
    termBg: '#1c1226',
    termFg: '#ece3f7',
    ansi: ['#271a35', '#ff6b8b', '#7cf0b0', '#ffd479', '#8f9bff', '#b57cff', '#7cc7ff', '#ece3f7', '#5c4a78', '#ff8aa4', '#9cf5c4', '#ffe09c', '#aab3ff', '#c99bff', '#9dd6ff', '#ffffff'],
  },
  {
    id: 'ultraviolet',
    name: 'Ultraviolet',
    dark: true,
    chrome: '#0b0616',
    side: '#120a22',
    chromeText: '#d9ccff',
    active: '#9d6bff',
    activeText: '#0b0616',
    bg: '#150d26',
    surface: '#1f1535',
    text: '#e8e0ff',
    muted: '#9a8fc0',
    border: '#2f2450',
    accent: '#9d6bff',
    link: '#56d4ff',
    code: '#ff6ad5',
    danger: '#ff4f7b',
    ok: '#5cf2a6',
    termBg: '#150d26',
    termFg: '#e8e0ff',
    ansi: ['#1f1535', '#ff4f7b', '#5cf2a6', '#ffd166', '#6b8bff', '#9d6bff', '#56d4ff', '#e8e0ff', '#4b3d73', '#ff7397', '#83f7bd', '#ffdc8a', '#8fa6ff', '#b993ff', '#86e0ff', '#ffffff'],
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
    id: 'dracula-midnight',
    name: 'Dracula Midnight',
    dark: true,
    chrome: '#0e0f14',
    side: '#14151b',
    chromeText: '#e9e9f4',
    active: '#bd93f9',
    activeText: '#14151b',
    bg: '#191a21',
    surface: '#21222c',
    text: '#f8f8f2',
    muted: '#9ea8c7',
    border: '#2e3040',
    accent: '#bd93f9',
    link: '#8be9fd',
    code: '#ff79c6',
    danger: '#ff5555',
    ok: '#50fa7b',
    termBg: '#14151b',
    termFg: '#f8f8f2',
    ansi: ['#14151b', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'],
  },
  {
    id: 'dracula-soft',
    name: 'Dracula Soft',
    dark: true,
    chrome: '#1f2029',
    side: '#262833',
    chromeText: '#d6d6e3',
    active: '#b4a0e5',
    activeText: '#1f2029',
    bg: '#2d2f3c',
    surface: '#363848',
    text: '#e6e6e0',
    muted: '#9aa1bd',
    border: '#474a5e',
    accent: '#b4a0e5',
    link: '#9ad8e6',
    code: '#ef8fc6',
    danger: '#e86f6f',
    ok: '#7ee3a0',
    termBg: '#2d2f3c',
    termFg: '#e6e6e0',
    ansi: ['#21222c', '#e86f6f', '#7ee3a0', '#ecef9d', '#b4a0e5', '#ef8fc6', '#9ad8e6', '#e6e6e0', '#6b74a0', '#f08484', '#95ebb2', '#f2f4b3', '#c7b6ee', '#f4a6d3', '#b3e3ed', '#ffffff'],
  },
  {
    id: 'dracula-pink',
    name: 'Dracula Pink',
    dark: true,
    chrome: '#191a21',
    side: '#21222c',
    chromeText: '#e9e9f4',
    active: '#ff79c6',
    activeText: '#1c1d26',
    bg: '#282a36',
    surface: '#343746',
    text: '#f8f8f2',
    muted: '#9ea8c7',
    border: '#44475a',
    accent: '#ff79c6',
    link: '#8be9fd',
    code: '#bd93f9',
    danger: '#ff5555',
    ok: '#50fa7b',
    termBg: '#282a36',
    termFg: '#f8f8f2',
    ansi: ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'],
  },
  {
    id: 'dracula-light',
    name: 'Dracula Light',
    dark: false,
    chrome: '#ece6d2',
    side: '#f5f0dd',
    chromeText: '#1f1f1f',
    active: '#644ac9',
    activeText: '#ffffff',
    bg: '#fffbeb',
    surface: '#ffffff',
    text: '#1f1f1f',
    muted: '#635d97',
    border: '#e3dcc4',
    accent: '#644ac9',
    link: '#036a96',
    code: '#a3144d',
    danger: '#cb3a2a',
    ok: '#14710a',
    termBg: '#fffbeb',
    termFg: '#1f1f1f',
    ansi: ['#1f1f1f', '#cb3a2a', '#14710a', '#846e15', '#644ac9', '#a3144d', '#036a96', '#bcbab3', '#635d97', '#d74c3d', '#198d0c', '#9e841a', '#7862d0', '#bf185a', '#047fb4', '#2c2b31'],
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
    id: 'tokyo-night-storm',
    name: 'Tokyo Night Storm',
    dark: true,
    chrome: '#1b1e2e',
    side: '#1f2335',
    chromeText: '#a9b1d6',
    active: '#3d59a1',
    activeText: '#e6ecff',
    bg: '#24283b',
    surface: '#292e42',
    text: '#c0caf5',
    muted: '#8089b3',
    border: '#3b4261',
    accent: '#7aa2f7',
    link: '#7dcfff',
    code: '#ff9e64',
    danger: '#f7768e',
    ok: '#9ece6a',
    termBg: '#24283b',
    termFg: '#c0caf5',
    ansi: ['#1d202f', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6', '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'],
  },
  {
    id: 'tokyo-night-day',
    name: 'Tokyo Night Day',
    dark: false,
    chrome: '#c4c8da',
    side: '#d0d5e3',
    chromeText: '#3760bf',
    active: '#2e7de9',
    activeText: '#ffffff',
    bg: '#e1e2e7',
    surface: '#e9e9ed',
    text: '#3760bf',
    muted: '#6172b0',
    border: '#c4c8da',
    accent: '#2e7de9',
    link: '#007197',
    code: '#b15c00',
    danger: '#f52a65',
    ok: '#587539',
    termBg: '#e1e2e7',
    termFg: '#3760bf',
    ansi: ['#e9e9ed', '#f52a65', '#587539', '#8c6c3e', '#2e7de9', '#9854f1', '#007197', '#6172b0', '#a1a6c5', '#f52a65', '#587539', '#8c6c3e', '#2e7de9', '#9854f1', '#007197', '#3760bf'],
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
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    dark: false,
    chrome: '#d5c4a1',
    side: '#ebdbb2',
    chromeText: '#3c3836',
    active: '#af3a03',
    activeText: '#fbf1c7',
    bg: '#fbf1c7',
    surface: '#f9f5d7',
    text: '#3c3836',
    muted: '#7c6f64',
    border: '#d5c4a1',
    accent: '#79740e',
    link: '#076678',
    code: '#af3a03',
    danger: '#9d0006',
    ok: '#79740e',
    termBg: '#fbf1c7',
    termFg: '#3c3836',
    ansi: ['#fbf1c7', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#7c6f64', '#928374', '#9d0006', '#79740e', '#b57614', '#076678', '#8f3f71', '#427b58', '#3c3836'],
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
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    dark: true,
    chrome: '#232634',
    side: '#292c3c',
    chromeText: '#c6d0f5',
    active: '#ca9ee6',
    activeText: '#303446',
    bg: '#303446',
    surface: '#414559',
    text: '#c6d0f5',
    muted: '#a5adce',
    border: '#51576d',
    accent: '#ca9ee6',
    link: '#8caaee',
    code: '#ef9f76',
    danger: '#e78284',
    ok: '#a6d189',
    termBg: '#303446',
    termFg: '#c6d0f5',
    ansi: ['#51576d', '#e78284', '#a6d189', '#e5c890', '#8caaee', '#f4b8e4', '#81c8be', '#b5bfe2', '#626880', '#e78284', '#a6d189', '#e5c890', '#8caaee', '#f4b8e4', '#81c8be', '#a5adce'],
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    dark: true,
    chrome: '#181926',
    side: '#1e2030',
    chromeText: '#cad3f5',
    active: '#c6a0f6',
    activeText: '#24273a',
    bg: '#24273a',
    surface: '#363a4f',
    text: '#cad3f5',
    muted: '#a5adcb',
    border: '#494d64',
    accent: '#c6a0f6',
    link: '#8aadf4',
    code: '#f5a97f',
    danger: '#ed8796',
    ok: '#a6da95',
    termBg: '#24273a',
    termFg: '#cad3f5',
    ansi: ['#494d64', '#ed8796', '#a6da95', '#eed49f', '#8aadf4', '#f5bde6', '#8bd5ca', '#b8c0e0', '#5b6078', '#ed8796', '#a6da95', '#eed49f', '#8aadf4', '#f5bde6', '#8bd5ca', '#a5adcb'],
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
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    dark: true,
    chrome: '#13111c',
    side: '#1f1d2e',
    chromeText: '#e0def4',
    active: '#c4a7e7',
    activeText: '#191724',
    bg: '#191724',
    surface: '#26233a',
    text: '#e0def4',
    muted: '#908caa',
    border: '#403d52',
    accent: '#ebbcba',
    link: '#9ccfd8',
    code: '#f6c177',
    danger: '#eb6f92',
    ok: '#9ccfd8',
    termBg: '#191724',
    termFg: '#e0def4',
    ansi: ['#26233a', '#eb6f92', '#31748f', '#f6c177', '#9ccfd8', '#c4a7e7', '#ebbcba', '#e0def4', '#6e6a86', '#eb6f92', '#31748f', '#f6c177', '#9ccfd8', '#c4a7e7', '#ebbcba', '#e0def4'],
  },
  {
    id: 'rose-pine-moon',
    name: 'Rosé Pine Moon',
    dark: true,
    chrome: '#1b192b',
    side: '#2a273f',
    chromeText: '#e0def4',
    active: '#c4a7e7',
    activeText: '#232136',
    bg: '#232136',
    surface: '#2a273f',
    text: '#e0def4',
    muted: '#908caa',
    border: '#44415a',
    accent: '#ea9a97',
    link: '#9ccfd8',
    code: '#f6c177',
    danger: '#eb6f92',
    ok: '#9ccfd8',
    termBg: '#232136',
    termFg: '#e0def4',
    ansi: ['#393552', '#eb6f92', '#3e8fb0', '#f6c177', '#9ccfd8', '#c4a7e7', '#ea9a97', '#e0def4', '#6e6a86', '#eb6f92', '#3e8fb0', '#f6c177', '#9ccfd8', '#c4a7e7', '#ea9a97', '#e0def4'],
  },
  {
    id: 'rose-pine-dawn',
    name: 'Rosé Pine Dawn',
    dark: false,
    chrome: '#f2e9e1',
    side: '#fffaf3',
    chromeText: '#575279',
    active: '#907aa9',
    activeText: '#fffaf3',
    bg: '#faf4ed',
    surface: '#fffaf3',
    text: '#575279',
    muted: '#797593',
    border: '#dfdad9',
    accent: '#d7827e',
    link: '#286983',
    code: '#ea9d34',
    danger: '#b4637a',
    ok: '#56949f',
    termBg: '#faf4ed',
    termFg: '#575279',
    ansi: ['#f2e9e1', '#b4637a', '#286983', '#ea9d34', '#56949f', '#907aa9', '#d7827e', '#575279', '#9893a5', '#b4637a', '#286983', '#ea9d34', '#56949f', '#907aa9', '#d7827e', '#575279'],
  },
  {
    id: 'everforest',
    name: 'Everforest',
    dark: true,
    chrome: '#1e2326',
    side: '#232a2e',
    chromeText: '#d3c6aa',
    active: '#a7c080',
    activeText: '#2d353b',
    bg: '#2d353b',
    surface: '#343f44',
    text: '#d3c6aa',
    muted: '#9da9a0',
    border: '#475258',
    accent: '#a7c080',
    link: '#7fbbb3',
    code: '#e69875',
    danger: '#e67e80',
    ok: '#a7c080',
    termBg: '#2d353b',
    termFg: '#d3c6aa',
    ansi: ['#475258', '#e67e80', '#a7c080', '#dbbc7f', '#7fbbb3', '#d699b6', '#83c092', '#d3c6aa', '#7a8478', '#e67e80', '#a7c080', '#dbbc7f', '#7fbbb3', '#d699b6', '#83c092', '#d3c6aa'],
  },
  {
    id: 'everforest-light',
    name: 'Everforest Light',
    dark: false,
    chrome: '#e6e2cc',
    side: '#efebd4',
    chromeText: '#5c6a72',
    active: '#35a77c',
    activeText: '#fdf6e3',
    bg: '#fdf6e3',
    surface: '#f4f0d9',
    text: '#5c6a72',
    muted: '#829181',
    border: '#e6e2cc',
    accent: '#35a77c',
    link: '#3a94c5',
    code: '#f57d26',
    danger: '#f85552',
    ok: '#8da101',
    termBg: '#fdf6e3',
    termFg: '#5c6a72',
    ansi: ['#5c6a72', '#f85552', '#8da101', '#dfa000', '#3a94c5', '#df69ba', '#35a77c', '#e6e2cc', '#a6b0a0', '#f85552', '#8da101', '#dfa000', '#3a94c5', '#df69ba', '#35a77c', '#fdf6e3'],
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    dark: true,
    chrome: '#16161d',
    side: '#181820',
    chromeText: '#c8c093',
    active: '#7e9cd8',
    activeText: '#1f1f28',
    bg: '#1f1f28',
    surface: '#2a2a37',
    text: '#dcd7ba',
    muted: '#a6a69c',
    border: '#363646',
    accent: '#7e9cd8',
    link: '#7fb4ca',
    code: '#ffa066',
    danger: '#e46876',
    ok: '#98bb6c',
    termBg: '#1f1f28',
    termFg: '#dcd7ba',
    ansi: ['#090618', '#c34043', '#76946a', '#c0a36e', '#7e9cd8', '#957fb8', '#6a9589', '#c8c093', '#727169', '#e82424', '#98bb6c', '#e6c384', '#7fb4ca', '#938aa9', '#7aa89f', '#dcd7ba'],
  },
  {
    id: 'kanagawa-dragon',
    name: 'Kanagawa Dragon',
    dark: true,
    chrome: '#0d0c0c',
    side: '#12120f',
    chromeText: '#c5c9c5',
    active: '#8ba4b0',
    activeText: '#181616',
    bg: '#181616',
    surface: '#282727',
    text: '#c5c9c5',
    muted: '#a6a69c',
    border: '#393836',
    accent: '#8ba4b0',
    link: '#8ea4a2',
    code: '#b6927b',
    danger: '#c4746e',
    ok: '#8a9a7b',
    termBg: '#181616',
    termFg: '#c5c9c5',
    ansi: ['#0d0c0c', '#c4746e', '#8a9a7b', '#c4b28a', '#8ba4b0', '#a292a3', '#8ea4a2', '#c8c093', '#a6a69c', '#e46876', '#87a987', '#e6c384', '#7fb4ca', '#938aa9', '#7aa89f', '#c5c9c5'],
  },
  {
    id: 'oxocarbon',
    name: 'Oxocarbon',
    dark: true,
    chrome: '#0c0c0c',
    side: '#131313',
    chromeText: '#dde1e6',
    active: '#be95ff',
    activeText: '#161616',
    bg: '#161616',
    surface: '#262626',
    text: '#f2f4f8',
    muted: '#a2a9b0',
    border: '#393939',
    accent: '#78a9ff',
    link: '#33b1ff',
    code: '#ff7eb6',
    danger: '#ee5396',
    ok: '#42be65',
    termBg: '#161616',
    termFg: '#f2f4f8',
    ansi: ['#262626', '#ee5396', '#42be65', '#ffe97b', '#33b1ff', '#ff7eb6', '#3ddbd9', '#dde1e6', '#393939', '#ee5396', '#42be65', '#ffe97b', '#33b1ff', '#ff7eb6', '#3ddbd9', '#ffffff'],
  },
  {
    id: 'ayu-mirage',
    name: 'Ayu Mirage',
    dark: true,
    chrome: '#1c212b',
    side: '#1f2430',
    chromeText: '#cccac2',
    active: '#ffcc66',
    activeText: '#1f2430',
    bg: '#242936',
    surface: '#282e3b',
    text: '#cccac2',
    muted: '#8a9199',
    border: '#33415e',
    accent: '#ffcc66',
    link: '#73d0ff',
    code: '#ffad66',
    danger: '#ff6666',
    ok: '#d5ff80',
    termBg: '#1f2430',
    termFg: '#cccac2',
    ansi: ['#171b24', '#ed8274', '#87d96c', '#facc6e', '#6dcbfa', '#dabafa', '#90e1c6', '#c7c7c7', '#686868', '#f28779', '#d5ff80', '#ffd173', '#73d0ff', '#dfbfff', '#95e6cb', '#ffffff'],
  },
  {
    id: 'ayu-light',
    name: 'Ayu Light',
    dark: false,
    chrome: '#e7eaed',
    side: '#f3f4f5',
    chromeText: '#5c6166',
    active: '#fa8d3e',
    activeText: '#ffffff',
    bg: '#fcfcfc',
    surface: '#ffffff',
    text: '#5c6166',
    muted: '#8a9199',
    border: '#e7eaed',
    accent: '#fa8d3e',
    link: '#399ee6',
    code: '#f07171',
    danger: '#e65050',
    ok: '#86b300',
    termBg: '#fcfcfc',
    termFg: '#5c6166',
    ansi: ['#000000', '#ea6c6d', '#6cbf43', '#eca944', '#3199e1', '#9e75c7', '#46ba94', '#bababa', '#686868', '#f07171', '#86b300', '#f2ae49', '#399ee6', '#a37acc', '#4cbf99', '#d1d1d1'],
  },
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    dark: true,
    chrome: '#19181a',
    side: '#221f22',
    chromeText: '#c1c0c0',
    active: '#ffd866',
    activeText: '#2d2a2e',
    bg: '#2d2a2e',
    surface: '#403e41',
    text: '#fcfcfa',
    muted: '#939293',
    border: '#5b595c',
    accent: '#a9dc76',
    link: '#78dce8',
    code: '#fc9867',
    danger: '#ff6188',
    ok: '#a9dc76',
    termBg: '#2d2a2e',
    termFg: '#fcfcfa',
    ansi: ['#403e41', '#ff6188', '#a9dc76', '#ffd866', '#fc9867', '#ab9df2', '#78dce8', '#fcfcfa', '#727072', '#ff6188', '#a9dc76', '#ffd866', '#fc9867', '#ab9df2', '#78dce8', '#fcfcfa'],
  },
  {
    id: 'nightfox',
    name: 'Nightfox',
    dark: true,
    chrome: '#0f151e',
    side: '#131a24',
    chromeText: '#aeafb0',
    active: '#719cd6',
    activeText: '#131a24',
    bg: '#192330',
    surface: '#212e3f',
    text: '#cdcecf',
    muted: '#8f9cad',
    border: '#29394f',
    accent: '#719cd6',
    link: '#63cdcf',
    code: '#f4a261',
    danger: '#c94f6d',
    ok: '#81b29a',
    termBg: '#192330',
    termFg: '#cdcecf',
    ansi: ['#393b44', '#c94f6d', '#81b29a', '#dbc074', '#719cd6', '#9d79d6', '#63cdcf', '#dfdfe0', '#575860', '#d16983', '#8ebaa4', '#e0c989', '#86abdc', '#baa1e2', '#7ad5d6', '#e4e4e5'],
  },
  {
    id: 'horizon',
    name: 'Horizon',
    dark: true,
    chrome: '#16161c',
    side: '#1a1c23',
    chromeText: '#cbced0',
    active: '#e95678',
    activeText: '#ffffff',
    bg: '#1c1e26',
    surface: '#232530',
    text: '#d5d8da',
    muted: '#8a8d9e',
    border: '#2e303e',
    accent: '#e95678',
    link: '#26bbd9',
    code: '#fab795',
    danger: '#e95678',
    ok: '#29d398',
    termBg: '#1c1e26',
    termFg: '#d5d8da',
    ansi: ['#16161c', '#e95678', '#29d398', '#fab795', '#26bbd9', '#ee64ac', '#59e1e3', '#fdf0ed', '#2e303e', '#ec6a88', '#3fdaa4', '#fbc3a7', '#3fc4de', '#f075b5', '#6be4e6', '#fdf0ed'],
  },
  {
    id: 'palenight',
    name: 'Palenight',
    dark: true,
    chrome: '#1b1e2b',
    side: '#202331',
    chromeText: '#a6accd',
    active: '#c792ea',
    activeText: '#292d3e',
    bg: '#292d3e',
    surface: '#32374d',
    text: '#a6accd',
    muted: '#7f85a3',
    border: '#3a3f58',
    accent: '#c792ea',
    link: '#82aaff',
    code: '#f78c6c',
    danger: '#ff5370',
    ok: '#c3e88d',
    termBg: '#292d3e',
    termFg: '#a6accd',
    ansi: ['#292d3e', '#ff5370', '#c3e88d', '#ffcb6b', '#82aaff', '#c792ea', '#89ddff', '#d0d0d0', '#434758', '#ff8b92', '#ddffa7', '#ffe585', '#9cc4ff', '#e1acff', '#a3f7ff', '#ffffff'],
  },
  {
    id: 'phosphor',
    name: 'Phosphor',
    dark: true,
    chrome: '#020703',
    side: '#06100a',
    chromeText: '#6fe08d',
    active: '#33ff66',
    activeText: '#03140a',
    bg: '#07110a',
    surface: '#0d1c12',
    text: '#86f5a2',
    muted: '#3f9a5c',
    border: '#1d3b26',
    accent: '#33ff66',
    link: '#7dfcd0',
    code: '#c6ff6b',
    danger: '#ff5f56',
    ok: '#33ff66',
    termBg: '#07110a',
    termFg: '#86f5a2',
    ansi: ['#0d1c12', '#ff5f56', '#33ff66', '#d7ff5f', '#4fe0b0', '#a6ff8f', '#7dfcd0', '#86f5a2', '#3f9a5c', '#ff7b73', '#66ff8c', '#e4ff8a', '#7ff0c8', '#c0ffb0', '#a4ffe0', '#d8ffe0'],
  },
  {
    id: 'amber',
    name: 'Amber',
    dark: true,
    chrome: '#0a0600',
    side: '#140d02',
    chromeText: '#e8a33c',
    active: '#ffb000',
    activeText: '#140d02',
    bg: '#120b02',
    surface: '#1d1306',
    text: '#ffc766',
    muted: '#b07b2c',
    border: '#3a2808',
    accent: '#ffb000',
    link: '#ffd27a',
    code: '#ff8f3f',
    danger: '#ff5c39',
    ok: '#d9e05b',
    termBg: '#120b02',
    termFg: '#ffc766',
    ansi: ['#1d1306', '#ff5c39', '#d9e05b', '#ffb000', '#e8a33c', '#ff8f3f', '#ffd27a', '#ffc766', '#6b4a17', '#ff7a5c', '#e6ec80', '#ffc94d', '#f0bb6a', '#ffab6b', '#ffe0a3', '#ffe9c2'],
  },
];

/** Stands for "Aubergine, light or dark as the device is set". */
export const AUTO = 'auto';

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

/** The fonts for everything but code. */
export const FONTS = [
  { value: 'lato', label: 'Lato', css: `Lato, ${SANS}` },
  { value: 'inter', label: 'Inter', css: `Inter, ${SANS}` },
  { value: 'geist', label: 'Geist', css: `'Geist Sans', ${SANS}` },
  { value: 'ibm-plex-sans', label: 'IBM Plex Sans', css: `'IBM Plex Sans', ${SANS}` },
  { value: 'space-grotesk', label: 'Space Grotesk', css: `'Space Grotesk', ${SANS}` },
  { value: 'ubuntu', label: 'Ubuntu', css: `Ubuntu, ${SANS}` },
  { value: 'atkinson', label: 'Atkinson Hyperlegible', css: `'Atkinson Hyperlegible', ${SANS}` },
  { value: 'lexend', label: 'Lexend', css: `Lexend, ${SANS}` },
  { value: 'system', label: 'System', css: SANS },
  { value: 'serif', label: 'Serif', css: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif" },
  { value: 'mono', label: 'JetBrains Mono', css: `'JetBrains Mono', ${MONO}` },
];

/**
 * The fonts for code: in messages, tool calls and the terminal. "System" is the
 * device's own monospace font; the terminal then uses JetBrains Mono, since it
 * draws its text itself and cannot reach every font the device has.
 */
export const CODE_FONTS = [
  { value: 'system', label: 'System', css: MONO },
  { value: 'jetbrains-mono', label: 'JetBrains Mono', css: `'JetBrains Mono', ${MONO}` },
  { value: 'fira-code', label: 'Fira Code', css: `'Fira Code', ${MONO}` },
  { value: 'iosevka', label: 'Iosevka', css: `Iosevka, ${MONO}` },
  { value: 'ibm-plex-mono', label: 'IBM Plex Mono', css: `'IBM Plex Mono', ${MONO}` },
  { value: 'cascadia-code', label: 'Cascadia Code', css: `'Cascadia Code', ${MONO}` },
  { value: 'victor-mono', label: 'Victor Mono', css: `'Victor Mono', ${MONO}` },
  { value: 'geist-mono', label: 'Geist Mono', css: `'Geist Mono', ${MONO}` },
  { value: 'commit-mono', label: 'Commit Mono', css: `'Commit Mono', ${MONO}` },
  { value: 'monaspace-neon', label: 'Monaspace Neon', css: `'Monaspace Neon', ${MONO}` },
  { value: 'source-code-pro', label: 'Source Code Pro', css: `'Source Code Pro', ${MONO}` },
  { value: 'space-mono', label: 'Space Mono', css: `'Space Mono', ${MONO}` },
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

/** Colours for charts, checked to stay apart for colour-blind readers, in light and dark. */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];

/**
 * Colours for code (the diff view): the theme's terminal colours, which each
 * theme picks to read well on its terminal background, so code looks as it
 * would in that theme's editor or terminal.
 */
function codeVariables(c: Colors, ansi: string[]): Record<string, string> {
  const bg = c.termBg;
  const fg = c.termFg;
  const [, red, green, yellow, blue, magenta, cyan, , dim, , , brightYellow, , brightMagenta, brightCyan] = ansi;
  return {
    '--code-bg': bg,
    '--code-fg': fg,
    '--code-gutter': mix(bg, fg, isLight(bg) ? 0.04 : 0.05),
    '--code-gutter-text': mix(fg, bg, 0.55),
    '--code-hunk': mix(bg, blue ?? fg, 0.14),
    '--code-hunk-text': mix(fg, bg, 0.35),
    '--code-add': mix(bg, green ?? c.ok, 0.18),
    '--code-add-sign': green ?? c.ok,
    '--code-del': mix(bg, red ?? c.danger, 0.18),
    '--code-del-sign': red ?? c.danger,
    '--code-mark': mix(bg, yellow ?? fg, 0.22),
    '--syn-keyword': magenta ?? fg,
    '--syn-string': green ?? fg,
    '--syn-number': brightYellow ?? yellow ?? fg,
    '--syn-type': yellow ?? fg,
    '--syn-function': blue ?? fg,
    '--syn-attr': cyan ?? fg,
    '--syn-builtin': brightCyan ?? cyan ?? fg,
    '--syn-tag': red ?? fg,
    '--syn-meta': brightMagenta ?? magenta ?? fg,
    '--syn-comment': dim ?? mix(fg, bg, 0.45),
  };
}

/** Every CSS variable the app uses, worked out from a theme's colours. */
function variables(c: Colors, dark: boolean, ansi: string[] = []): Record<string, string> {
  const chromeLight = isLight(c.chrome);
  const termLight = isLight(c.termBg);
  return {
    ...codeVariables(c, ansi),
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
    // Something waiting for you (a permission card in a chat): the theme's own yellow, darker on a light sidebar.
    '--attention': chromeLight ? mix(ansi[3] ?? '#d99a1e', '#000000', 0.3) : (ansi[3] ?? '#e8a33d'),
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
    // Chart colours: the same eight hues in a fixed order, stepped for a light or a dark page.
    ...Object.fromEntries((dark ? SERIES_DARK : SERIES_LIGHT).map((hex, i) => [`--series-${i + 1}`, hex])),
    '--shadow': dark ? '0 1px 2px rgb(0 0 0 / 30%), 0 8px 24px rgb(0 0 0 / 45%)' : '0 1px 2px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 10%)',
    '--term-bg': c.termBg,
    '--term-fg': c.termFg,
    '--term-strip': mix(c.termBg, '#000000', termLight ? 0.1 : 0.32),
    '--term-tab': mix(c.termBg, '#000000', termLight ? 0.05 : 0.16),
    '--term-dim': mix(c.termFg, c.termBg, 0.38),
    '--term-key': mix(c.termBg, c.termFg, 0.16),
  };
}

type Saved = { preset?: string; custom?: Partial<Colors>; font?: string; codeFont?: string; size?: string };

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
  codeFont = $state('system');
  size = $state('15');
  /** Whether the device asks for dark colours, which is what AUTO follows. */
  #systemDark = $state(false);

  constructor() {
    const saved = load();
    if (saved.preset === AUTO || PRESETS.some((p) => p.id === saved.preset)) this.preset = saved.preset!;
    if (saved.custom && typeof saved.custom === 'object') this.custom = saved.custom;
    if (FONTS.some((f) => f.value === saved.font)) this.font = saved.font!;
    if (CODE_FONTS.some((f) => f.value === saved.codeFont)) this.codeFont = saved.codeFont!;
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

  setCodeFont(font: string): void {
    this.codeFont = font;
    this.#apply();
  }

  /** The font the terminal draws in: the code font, or JetBrains Mono where that is the device's own. */
  get terminalFont(): string {
    return this.codeFont === 'system' ? CODE_FONTS[1]!.css : (CODE_FONTS.find((f) => f.value === this.codeFont)?.css ?? CODE_FONTS[1]!.css);
  }

  setSize(size: string): void {
    this.size = size;
    this.#apply();
  }

  #apply(): void {
    const style = document.documentElement.style;
    const dark = this.base.dark;
    for (const [name, value] of Object.entries(variables(this.colors, dark, this.base.ansi))) style.setProperty(name, value);
    style.setProperty('color-scheme', dark ? 'dark' : 'light');
    style.setProperty('--font', FONTS.find((f) => f.value === this.font)?.css ?? FONTS[0]!.css);
    style.setProperty('--mono', CODE_FONTS.find((f) => f.value === this.codeFont)?.css ?? CODE_FONTS[0]!.css);
    style.setProperty('--text-size', `${this.size}px`);
    // The browser's own frame (a phone's status bar, an installed app's title bar) takes the rail's colour.
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = this.colors.chrome;
    try {
      const saved: Saved = { preset: this.preset, custom: $state.snapshot(this.custom), font: this.font, codeFont: this.codeFont, size: this.size };
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      // Not remembered this time; the look still changes.
    }
  }
}

export const theme = new ThemeState();

/** The CSS variables for a preset, for drawing a small picture of it. */
export function previewVariables(preset: Preset): Record<string, string> {
  return variables(preset, preset.dark, preset.ansi);
}
