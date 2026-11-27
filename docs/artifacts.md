# Artifacts

[← README](../README.md) · [All docs](../README.md#documentation)

Artifacts are things an agent makes for you to look at, use or keep: a page or a small
app, a dashboard, a document, a diagram, a picture, a complete file of code, or a file
it made in the chat's folder. Clack shows them beside the chat, keeps every version, and
lists them all on the **Artifacts** page.

## Making them

Ask for one in a chat: "make an artifact with…", "build me a small page that…", "write
the release notes as a document", "draw the architecture". The agent makes it with
Clack's own tools, which save it in `data/artifacts`, outside the chat's folder:

- **create_artifact** makes one: a title, a type and the content (or the path of a file
  it made in the chat's folder).
- **update_artifact** saves a new version when you ask for changes ("make the chart
  blue"); earlier versions are kept.
- **list_artifacts** and **read_artifact** let it find and read them again, after a
  long chat or one handed over from the other agent.

(Clack's tools also include **update_steps**, which shows the agent's steps for the
turn: see [Steps and Raw](chats.md#steps-and-raw).)

These tools only save into `data/artifacts`, so Claude uses them without asking for
permission. Codex gets them from a small MCP server that comes with Clack
(`server/plugin/mcp/clack-tools.mjs`), which Codex starts for each chat; depending on the
mode, Codex may ask before using them, as it does for any MCP tool. A skill that comes
with Clack (`server/plugin/skills/artifacts`) tells both agents when an artifact fits and
how to make a good one. Where an artifact was made or changed, the chat shows a card with its title,
kind and version; click it to open that version.

## Kinds

| Kind | Shown as |
| --- | --- |
| **Page** (HTML: pages, small apps, dashboards, games) | Live, in a sealed frame |
| **Picture** (SVG) | The picture |
| **Document** (Markdown) | Rendered, with ` ```mermaid ` diagrams drawn |
| **Diagram** (Mermaid) | The diagram, with zoom |
| **Code** | Highlighted in the theme's code colours |
| **File** (anything the agent made in the chat's folder) | Pictures and PDFs shown, CSV as a table, the rest as a download |

Pages, pictures, documents and diagrams have **Preview** and **Code**, to see how they
look or their source.

## In a chat

When a chat has artifacts, an **Artifacts** button appears beside the sidebar button at
the top left, with how many there are, and an **Artifacts** chip in the chat's header,
between Context and Background. Either opens the artifacts **in the sidebar's place** on
the left, wider than the sidebar so there is room to see them, with the chat beside them.
The chats and the artifacts take turns: opening the artifacts puts the chats away, and
showing the chats (the sidebar button, or Cmd/Ctrl+Shift+D) closes the artifacts. Drag
the edge to make the panel wider or narrower; the width is remembered.

At the top of the panel, pick one of the chat's artifacts. Below that:

- **Version:** the latest, which follows the agent's changes as they come, or any
  earlier one, with what changed.
- **Preview / Code**, **Copy**, **Download**, and **Open in a new window**.

On a phone the artifacts cover the screen; the × brings the chat back.

## The Artifacts page

**Artifacts** in the rail, below Notes, lists every artifact, grouped by chat in the
sidebar and as cards on the page, with a filter by kind. The search field narrows both.
Open one to see it in full, with the same tools as in the chat, a link to its chat, and
**Delete**.

## When a chat is deleted

Deleting a chat that has artifacts asks what to do with them: **keep them** (the
default) or **delete them too**. Kept artifacts stay on the Artifacts page under the
chat's old title, marked **deleted chat**; its **⋯** menu deletes them all later.

## Where they are kept

```
data/artifacts/
  <chat id>/
    budget-dashboard-3f2a/
      meta.json     the title, the kind and the versions
      v1.html
      v2.html
```

## Safety

An artifact is code an agent wrote, so a page runs sealed off:

- It runs in a sandbox, with no origin of its own: it cannot read Clack's cookies, call
  Clack's API, or touch the page around it.
- It cannot load anything from the internet, or send anything there: everything it
  needs must be inside the file (offline only).
- The same holds when it is opened in a new window.

Pictures (SVG) are shown as images, so their scripts never run. Files from the chat's
folder are only taken from inside it, never through a link that leads outside.
