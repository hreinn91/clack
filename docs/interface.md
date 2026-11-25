# The interface

[← README](../README.md) · [All docs](../README.md#documentation)

The window, the Data page with its file tree and terminals, and the themes.

## The window

The window has four parts:

- **Top bar:** back and forward, and a search field that narrows the chats and folders
  in the sidebar as you type. Escape clears it.
- **Rail** on the far left: **Home** returns to the most recent chat, **Notes** opens
  your [notes](notes.md) at the one you had open last, **Usage** shows
  your plan's [limits](usage-and-tools.md#usage), **Tools** lists the [MCP servers, skills and
  tools](usage-and-tools.md#tools-and-skills) Claude can use, **Activity** opens
  the [activity log](usage-and-tools.md#activity-log), **Data** opens the [data page](#data-page),
  **Theme** opens the [themes](#themes), **Help** says whether each agent is signed in on the server, how to sign in,
  the keyboard shortcuts and a few tips, **+** starts a chat, and your picture at the bottom shows whether the browser is connected
  and holds **Sign out**. Its menu also has **Upload a picture…**: any PNG, JPEG, WebP or
  other picture the browser can open, cropped to the middle square and shrunk to 256
  pixels before it is sent. It then stands in for your initials everywhere, including next
  to your messages. **Change picture…** and **Remove picture** are there once you have one.
- **Sidebar:** **Active** lists the chats whose agent is working, waiting for you, or
  done with a reply you have not read yet (see [The Active list](chats.md#the-active-list)).
  **Chats** below it shows the folders under `data/sessions` as a tree, with each
  folder's chats listed under it. The dot before a chat pulses while its agent is
  working. See [Managing chats](chats.md#managing-chats). On the Notes page it shows
  the notes instead, and on the Data page the data directory.
- **Message box:** what you type stays with its chat. Open another chat and that one's
  own unsent message (and attached files) shows instead; come back and yours is still
  there, after a reload or a server restart too. Drafts are kept on the server, in
  `data/drafts.json`, so a message started on the laptop is waiting on the phone, and
  clearing or sending it there clears it everywhere. Beside the send button, where the
  chat works is written like a shell prompt: the folder (deep ones shortened to their last two parts) and, when the folder
  is in a git repository, `on` and the branch, with a `*` when something is not
  committed. Clack detects repositories under `data/sessions` and in added project folders. Click it to [change the folder](chats.md#managing-chats).
- **Conversation:** messages are stacked on the left, each with a picture, a name and
  the time. Yours carry your name. Claude's carry the model and the effort it ran at,
  such as **Fable 5.2 High**, so a chat that switched model or effort part-way shows
  who wrote what. Everything Claude did in one turn (thinking, tool calls, text) sits
  under a single name.

Your name is the name of the account the server runs as; set `CLACK_USER_NAME` in `.env`
to change it. With "Default effort" chosen, a reply is first signed with the model alone
and gains the effort when the turn ends, because Claude Code only records which effort
it picked in the chat's transcript.

The sidebar can be resized and put away to leave the conversation more room:

- Drag its right edge to make it narrower or wider. Double-click the edge to go back to
  the usual width.
- Hide or show it with the button at the left of the top bar, or with Cmd+Shift+D
  (Ctrl+Shift+D on Windows and Linux). Dragging the edge all the way to the left hides
  it too, and dragging the edge back out shows it again.
- The edge also takes keyboard focus: the left and right arrow keys resize, Enter hides
  or shows.

The width and whether the sidebar is hidden are remembered per browser.

On a phone the rail and sidebar slide in from the left with the menu button, and the
search field moves into the sidebar.

Out of the box the colours follow the device's light or dark setting; see
[Themes](#themes) for the rest. The fonts are bundled with the app, so the UI loads
nothing from outside the Clack server.

## Data page

**Data** in the rail shows what is in the data directory and lets you work in it.

**Folder tree.** While the page is open the sidebar shows the data directory instead of
the chats. Click a folder to unfold it and a file to look at it. The search field narrows
the files by name. The round arrow at the top reads the folders again; Claude changes
files behind the page's back, and the tree is otherwise only read when you open the page
or unfold a folder. Hovering a folder shows two buttons: start a chat in it (session
folders only) and open a terminal in it.

**File preview.** Text files show their first 256 KB, pictures (PNG, JPEG, GIF, WebP)
are shown as pictures, and anything else is reported as not being text. The preview is
read-only. Drag the line between the preview and the terminals to give either more room.

**Terminals.** Each tab is a login shell on the server computer, started in the folder
you picked, or in the data directory with **+**. It is the same shell with the same
configuration you get in a terminal on that computer.

- A shell keeps running on the server when you leave the page, close the browser or a
  phone goes to sleep. Coming back reconnects and redraws its recent output (the last
  400,000 characters).
- Typing `exit`, or closing the tab, ends the shell and whatever was running in it.
  Stopping the Clack server ends all of them.
- Up to 12 shells can be open at once.
- On a touch screen a row of extra keys (Esc, Tab, Ctrl+C, Ctrl+D, arrows) appears under
  the terminal.
- What you do in a terminal is not written to the [activity log](usage-and-tools.md#activity-log).

The terminal emulator is [xterm.js](https://xtermjs.org), drawn in the colours of the
chosen theme with JetBrains Mono. It is part of the web app: nothing needs to be
installed on the computer you browse from. A shell is started at the size of the browser
that opens it. The shell side uses
[node-pty](https://github.com/microsoft/node-pty), which ships ready-built for macOS and
Windows. On Linux it is compiled during `npm install`, which needs a C++ toolchain
(`build-essential` and `python3` on Debian and Ubuntu). Newer versions of npm only run a
package's install script when the project allows it; `package.json` allows node-pty's.
The [Docker image](docker.md) takes care of all this.

To remove terminals, set `CLACK_TERMINAL=off` in `.env`. The tree and previews stay.
See [Security](security.md) before using terminals on a network you share.

## Themes

**Theme** in the rail changes how Clack looks. The choice is remembered per browser.

- **Presets:** 48 of them, many the colour schemes people share on r/unixporn, each with
  matching terminal colours. **All / Dark / Light** above the list narrows it.
  - Aubergine (automatic light or dark, or either one fixed)
  - Cherry Blossom pairs petal pink with mulberry and leaf green. Pink Moon Jelly mixes
    orchid and candy pink with a violet terminal.
  - Matcha Picnic has a pistachio sidebar, cream paper and marmalade buttons. Lime Zine
    pairs electric chartreuse with violet ink.
  - Tidal Glass uses seafoam and deep teal. Cobalt Coast pairs a
    marine-blue sidebar with a sunlit apricot selection.
  - Deep Ocean pairs midnight blue with bright cyan. Forest Canopy pairs pine green
    with fern accents and warm amber code.
  - Amethyst and Ultraviolet, two dark purples
  - Dracula, Dracula Midnight (darker), Dracula Soft (lower contrast), Dracula Pink and
    Dracula Light
  - Catppuccin Mocha, Macchiato, Frappé and Latte
  - Rosé Pine, Rosé Pine Moon and Rosé Pine Dawn
  - Tokyo Night, Tokyo Night Storm and Tokyo Night Day
  - Gruvbox and Gruvbox Light; Everforest and Everforest Light
  - Kanagawa and Kanagawa Dragon; Ayu Mirage and Ayu Light
  - Nord, One Dark, Solarized Dark and Light, Monokai Pro, Nightfox, Oxocarbon,
    Palenight, Horizon, Cyberpunk and Synthwave
  - Phosphor and Amber, two old CRT terminal looks
- **Colours:** any of a theme's main colours can be changed with a colour picker or a
  hex code; hover shades and soft backgrounds are worked out from them. **Back to …**
  undoes the changes, and picking another preset starts over from its colours.
- **Text:**
  - **Font**, for everything but code: Lato, Inter, Geist, IBM Plex Sans, Space Grotesk,
    Ubuntu, Atkinson Hyperlegible, Lexend, the system font, serif, or JetBrains Mono.
  - **Code font**, for code in messages and the terminal on the data page: the system's
    monospace font, JetBrains Mono, Fira Code, Iosevka, IBM Plex Mono, Cascadia Code, Victor
    Mono, Geist Mono, Commit Mono, Monaspace Neon, Source Code Pro or Space Mono. With the
    system font the terminal uses JetBrains Mono.
  - **Size** of message text.
- **Fonts are bundled:** they come with the app, so nothing is fetched from elsewhere; a
  browser only downloads the ones it shows.
