---
name: mermaid-diagrams
description: Draw diagrams and charts in the chat with Mermaid. Use when the person asks for a diagram, chart, graph, flowchart, sequence diagram, state machine, ER or class diagram, timeline, Gantt chart, pie chart, mind map, or asks to visualise, map out or sketch how something fits together or flows.
---

# Diagrams in clack

This chat is shown in clack, which draws fenced ```mermaid code blocks in your
reply as diagrams, in place, between your text. The person can zoom into a
diagram and download it as a picture. Nothing needs to be installed and no file
needs to be written: put the diagram in your reply.

## How to answer

1. Pick the diagram type that fits (see below). One clear diagram beats several.
2. Write a sentence or two of text, then the diagram in a ```mermaid block, then
   anything that needs explaining.
3. Keep it readable: around 15 nodes or fewer. Split a big system into an
   overview plus a closer look at one part.
4. Do not also paste an ASCII drawing of the same thing.

## No files for diagrams

Clack keeps a copy of every diagram in your replies by itself, in its own data
directory (`data/diagrams/<chat id>/`), outside the person's project. So:

- Do not write diagram files (`.mmd`, `.svg`, `.png`) into the project folder,
  and do not save chart data (CSV, JSON) there just to draw a chart. Work the
  figures out, and put them in the diagram itself (`pie`, `xychart-beta` take
  the numbers directly).
- If the data has to come from a file or a command, read it, but write nothing
  back for the diagram.
- If the person asks for a diagram as a file to keep or download, make it an
  artifact (`create_artifact` with type `mermaid`), which Clack also keeps in
  its data directory.

| Showing | Use |
| --- | --- |
| A process, a decision, how parts connect | `flowchart LR` or `flowchart TD` |
| Who calls whom, in what order (requests, APIs) | `sequenceDiagram` |
| States and what moves between them | `stateDiagram-v2` |
| Data model, tables and relations | `erDiagram` |
| Classes, types and their relations | `classDiagram` |
| A plan over time | `gantt` or `timeline` |
| Shares of a whole | `pie` |
| Values over categories | `xychart-beta` |
| Ideas around a topic | `mindmap` |
| Git branches and merges | `gitGraph` |

## Syntax that keeps diagrams from breaking

Mermaid stops at the first mistake, and the person then sees only your code.

- Quote any label with spaces or punctuation: `A["Load config (env)"]`,
  `B{"Valid?"}`. Brackets, parentheses, colons, slashes, `#`, `&` and quotes
  inside unquoted labels break the diagram.
- Node ids are plain words without spaces: `apiServer["API server"]`, never
  `API server`.
- Never name a node `end` (lowercase) in a flowchart; use `done` or `End`.
- Edge labels: `A -->|"on success"| B`.
- In `sequenceDiagram`, write participants as `participant API as "API server"`
  and keep message text free of `;` and `#`.
- In `erDiagram`, relations look like `USER ||--o{ ORDER : places`.
- Leave out `%%{init: ...}%%`, `classDef` colours and `style` lines: clack
  colours diagrams to match the person's theme, and fixed colours can clash with it.
- No HTML in labels and no `click` lines: they are switched off.

## Example

```mermaid
flowchart LR
  browser["Browser"] -->|"HTTPS"| proxy["Reverse proxy"]
  proxy --> app["App server"]
  app --> db[("Postgres")]
  app --> cache[("Redis")]
```
