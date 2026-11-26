---
name: artifacts
description: Make artifacts in Clack - standalone pages, small web apps, dashboards, documents, SVG pictures, diagrams or code files the person can open beside the chat, keep and download. Use when the person asks for an artifact, a page, an app, a mock-up, a visualisation, a report or document to keep, or something to look at or reuse rather than read once; and when changing one made earlier.
---

# Artifacts in Clack

Clack shows artifacts beside the chat, keeps every version, and lets the person
download them. Make them with Clack's tools, not by writing files in the folder:

- `create_artifact` - title, type, and the whole content (or the path of a file
  you made in the chat's folder). It returns the artifact's id.
- `update_artifact` - the id and the whole new content, plus a short note of
  what changed. Use it whenever the person asks to change an artifact: never
  make a second artifact for a new version of the same thing.
- `list_artifacts` and `read_artifact` - find the ids, or read an artifact back
  (after a long chat, or a chat handed over from the other agent).

For Claude Code they are `mcp__clack__create_artifact` and so on; for Codex,
the `clack` server's tools.

## When to make one

Make an artifact for something substantial that will be looked at, used or
kept: a page or tool, a dashboard, a game, a long document or report, a
diagram, a picture, a complete file of code. Answer in the chat as usual for
short answers, explanations and small snippets. After making or changing one,
say in a sentence what it is; do not paste its content into the reply.

## Types

| type | for | content |
| --- | --- | --- |
| `html` | pages, small apps, dashboards, games, visualisations | one complete HTML file |
| `svg` | pictures, icons, illustrations | one SVG file |
| `markdown` | documents, reports, plans | Markdown; ```mermaid blocks are drawn |
| `mermaid` | a diagram on its own | Mermaid code |
| `code` | a complete file of source code | the code, with `language` set |
| `file` | anything else you made in the folder: a PNG chart, a PDF, a CSV | `path` to the file |

## HTML must work offline

HTML artifacts run sealed off from Clack and from the internet:

- Put all CSS in `<style>` and all JavaScript in `<script>` in the one file.
- Load nothing: no CDNs, web fonts, remote images or API calls. Draw charts with
  plain SVG or canvas; embed small images as `data:` URLs.
- No `localStorage`, cookies or calls back to a server; keep state in variables.
- Make it fit any width (it is shown in a side panel and on phones), and look
  right in both light and dark (`prefers-color-scheme`).

## Good artifacts

- A clear title, as the person would call it ("Budget dashboard", not "artifact1").
- Complete: no placeholders, no "rest of the code here".
- For a change, read the latest version first if it is not fresh in mind, then
  give the whole new content to `update_artifact` with a note such as "blue
  chart colours".
