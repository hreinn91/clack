<script lang="ts">
  import type { Capabilities } from '../../../shared/protocol';
  import { ago } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import Picker from './Picker.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  // What Claude Code can use in a chat: MCP servers and their tools, skills,
  // agents, custom commands and its built-in tools. Set-up can differ per
  // folder (a folder's own .mcp.json or skills), so a folder can be picked.

  const EVERYWHERE = '';

  let folder = $state(EVERYWHERE);
  let filter = $state('');
  let loading = $state(false);
  let error = $state('');
  let found = $state<Capabilities | null>(null);

  async function load(fresh = false) {
    const asked = folder;
    loading = true;
    error = '';
    try {
      const answer = await app.loadCapabilities(asked, fresh);
      if (asked === folder) found = answer;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  // Asked again whenever another folder is picked.
  $effect(() => {
    folder;
    void load();
  });

  $effect(() => {
    void app.loadFolders();
  });

  const folderOptions = $derived([
    { value: EVERYWHERE, label: 'Everywhere', description: 'Your own setup, in every chat' },
    ...app.pickableFolders
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name, description: 'Adds what this folder sets up itself' })),
  ]);

  /** What the built-in tools do, in a line; tools not listed here are shown by name. */
  const TOOL_NOTES: Record<string, string> = {
    Agent: 'Hands a piece of work to a helper agent',
    AskUserQuestion: 'Asks you a multiple-choice question',
    Bash: 'Runs shell commands',
    CronCreate: 'Schedules a prompt to run later',
    CronDelete: 'Removes a scheduled prompt',
    CronList: 'Lists scheduled prompts',
    Edit: 'Changes part of a file',
    EnterPlanMode: 'Switches to planning before changing anything',
    EnterWorktree: 'Works in a separate git worktree',
    ExitPlanMode: 'Presents a plan for your approval',
    ExitWorktree: 'Leaves the git worktree again',
    Glob: 'Finds files by name',
    Grep: 'Searches inside files',
    ListMcpResourcesTool: 'Lists what MCP servers offer to read',
    Monitor: 'Watches a command or file and reports changes',
    NotebookEdit: 'Edits Jupyter notebooks',
    Read: 'Reads files, pictures and PDFs',
    ReadMcpResourceTool: 'Reads something an MCP server offers',
    Skill: 'Runs a skill',
    TaskCreate: 'Adds a step to its task list',
    TaskGet: 'Looks up a step on its task list',
    TaskList: 'Shows its task list',
    TaskOutput: 'Reads what a background task printed',
    TaskStop: 'Stops a background task',
    TaskUpdate: 'Updates a step on its task list',
    TodoWrite: 'Keeps a to-do list for the task at hand',
    WebFetch: 'Reads a web page',
    WebSearch: 'Searches the web',
    Write: 'Writes whole files',
  };

  /** Where a skill comes from, said plainly. */
  function skillSource(source: string, plugin?: string): string {
    if (plugin) return `Plugin: ${plugin}`;
    return (
      {
        'built-in': 'Built in',
        bundled: 'Built in',
        userSettings: 'Yours',
        projectSettings: 'This folder',
        localSettings: 'This folder',
        policySettings: 'Managed',
        syncedSkills: 'Your Claude account',
        plugin: 'Plugin',
      }[source] ?? source
    );
  }

  /** Where an MCP server is set up, said plainly. */
  function scopeLabel(scope?: string): string {
    if (!scope) return '';
    return (
      {
        user: 'Yours',
        project: "This folder's .mcp.json",
        local: 'This folder (local)',
        claudeai: 'claude.ai connector',
        plugin: 'Plugin',
        managed: 'Managed',
        enterprise: 'Managed',
        dynamic: 'Added while running',
        sdk: 'clack',
      }[scope] ?? scope
    );
  }

  const STATUS: Record<Capabilities['mcpServers'][number]['status'], { label: string; tone: string }> = {
    connected: { label: 'Connected', tone: 'good' },
    'needs-auth': { label: 'Needs sign-in', tone: 'warn' },
    failed: { label: 'Failed', tone: 'bad' },
    pending: { label: 'Connecting', tone: 'quiet' },
    disabled: { label: 'Turned off', tone: 'quiet' },
  };

  const query = $derived(filter.trim().toLowerCase());
  const hit = (...texts: (string | undefined)[]) => !query || texts.some((text) => text?.toLowerCase().includes(query));

  const servers = $derived(
    (found?.mcpServers ?? [])
      .map((server) => {
        const named = hit(server.name, scopeLabel(server.scope));
        const tools = named ? server.tools : server.tools.filter((tool) => hit(tool.name, tool.description));
        return named || tools.length ? { ...server, tools } : null;
      })
      .filter((server) => server !== null),
  );
  const skills = $derived((found?.skills ?? []).filter((skill) => hit(skill.name, skill.description, skillSource(skill.source, skill.plugin))));
  const agents = $derived((found?.agents ?? []).filter((agent) => hit(agent.name, agent.description)));
  const commands = $derived((found?.commands ?? []).filter((command) => hit(command.name, command.description)));
  const tools = $derived((found?.tools?.names ?? []).filter((name) => hit(name, TOOL_NOTES[name])));
  const nothing = $derived(found && !servers.length && !skills.length && !agents.length && !commands.length && !tools.length);

  /** MCP tools are named mcp__server__tool inside Claude Code; the list shows the last part. */
  const shortTool = (name: string) => name.replace(/^mcp__.+?__/, '');
</script>

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <h1>Tools and skills</h1>
</header>

<div class="scroll">
  <div class="panel">
    <p class="intro">
      What Claude can use in your chats: MCP servers and their tools, skills, agents, your own slash commands, and Claude
      Code's built-in tools. A folder can add its own (a <code>.mcp.json</code>, or skills in <code>.claude/skills</code>);
      pick it to see those too.
    </p>

    <div class="bar">
      <span class="where">
        <span class="label">Folder</span>
        <span class="location"><Picker label="Folder to look in" value={folder} options={folderOptions} placement="down" onpick={(value) => (folder = value)} /></span>
      </span>
      <input class="filter" type="search" placeholder="Filter by name or description" aria-label="Filter" bind:value={filter} />
      <button class="btn" disabled={loading} onclick={() => load(true)}>
        <svg class:spin={loading} width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M16 10a6 6 0 1 1-1.8-4.3M16.5 3.5v3h-3" />
        </svg>
        Refresh
      </button>
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if loading && !found}
      <p class="wait"><span class="spinner"></span> Asking Claude Code… MCP servers can take a few seconds to connect.</p>
    {:else if found}
      <p class="checked">
        {#if loading}Asking again…{:else}Checked {ago(found.measuredAt) === 'now' ? 'just now' : `${ago(found.measuredAt)} ago`}.{/if}
        Nothing is sent to Claude to find this out, so it costs no tokens.
      </p>

      {#if nothing}
        <p class="empty">Nothing matches “{filter}”.</p>
      {/if}

      {#if servers.length || !query}
        <section>
          <h2>MCP servers <span class="count">{servers.length}</span></h2>
          {#if servers.length}
            <ul class="servers">
              {#each servers as server (server.name)}
                {@const status = STATUS[server.status] ?? { label: server.status, tone: 'quiet' }}
                <li>
                  <details open={query !== '' && server.tools.length > 0}>
                    <summary>
                      <svg class="caret" width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M3 1.5 7.5 5 3 8.5z" /></svg>
                      <span class="name">{server.name}</span>
                      <span class="status {status.tone}"><span class="dot" aria-hidden="true"></span>{status.label}</span>
                      <span class="sub">
                        {scopeLabel(server.scope)}{server.version ? ` · v${server.version}` : ''} · {server.tools.length} tool{server.tools.length === 1 ? '' : 's'}
                      </span>
                    </summary>
                    {#if server.error}<p class="note bad">{server.error}</p>{/if}
                    {#if server.status === 'needs-auth'}
                      <p class="note">
                        Not signed in, so its tools are not available. Sign in where it was set up: claude.ai connectors in
                        claude.ai's settings, others with <code>/mcp</code> in Claude Code on the server.
                      </p>
                    {/if}
                    {#if server.tools.length}
                      <ul class="tools">
                        {#each server.tools as tool (tool.name)}
                          <li>
                            <code>{shortTool(tool.name)}</code>
                            {#if tool.readOnly}<span class="tag">read-only</span>{/if}
                            {#if tool.destructive}<span class="tag bad">can delete</span>{/if}
                            {#if tool.description}<p>{tool.description}</p>{/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </details>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="empty">No MCP servers are set up. Add them with <code>claude mcp add</code> on the server, or as connectors on claude.ai.</p>
          {/if}
        </section>
      {/if}

      {#if skills.length}
        <section>
          <h2>Skills <span class="count">{skills.length}</span></h2>
          <p class="lead">
            Instructions Claude loads when a task calls for them.
            {#if skills.some((skill) => skill.invocable)}
              Most can also be run by name, like <code>/{skills.find((skill) => skill.invocable)!.name}</code>; the ones marked
              <span class="tag inline">Claude only</span> cannot.
            {/if}
          </p>
          <ul class="rows">
            {#each skills as skill (skill.name)}
              <li>
                <div class="head">
                  <code>{skill.invocable ? '/' : ''}{skill.name}</code>
                  {#if !skill.invocable}
                    <span class="tag only" title="Claude uses this skill on its own; it cannot be run as a /command">Claude only</span>
                  {/if}
                  <span class="tag">{skillSource(skill.source, skill.plugin)}</span>
                </div>
                {#if skill.description}
                  <p class="desc" title={skill.description}>{skill.description}</p>
                {:else}
                  <p class="desc none">Claude Code gives no description for this one.</p>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if agents.length}
        <section>
          <h2>Agents <span class="count">{agents.length}</span></h2>
          <p class="lead">Helpers Claude can hand part of a task to.</p>
          <ul class="rows">
            {#each agents as agent (agent.name)}
              <li>
                <div class="head">
                  <code>{agent.name}</code>
                  {#if agent.model && agent.model !== 'inherit'}<span class="tag">{agent.model}</span>{/if}
                </div>
                <p class="desc" title={agent.description}>{agent.description}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if commands.length}
        <section>
          <h2>Your slash commands <span class="count">{commands.length}</span></h2>
          <ul class="rows">
            {#each commands as command (command.name)}
              <li>
                <div class="head">
                  <code>/{command.name}{command.argumentHint ? ` ${command.argumentHint}` : ''}</code>
                </div>
                {#if command.description}<p class="desc">{command.description}</p>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if tools.length || (!query && !found.tools)}
        <section>
          <h2>Built-in tools <span class="count">{tools.length}</span></h2>
          {#if found.tools}
            <p class="lead">
              Claude Code's own tools, as the last chat to start reported them ({ago(found.tools.seenAt) === 'now' ? 'just now' : `${ago(found.tools.seenAt)} ago`}).
              Permission mode decides which of them ask first.
            </p>
            <ul class="grid">
              {#each tools as name (name)}
                <li><code>{name}</code>{#if TOOL_NOTES[name]}<span>{TOOL_NOTES[name]}</span>{/if}</li>
              {/each}
            </ul>
          {:else}
            <p class="empty">Claude Code names its built-in tools when a conversation starts. Send a message in any chat and they show up here.</p>
          {/if}
        </section>
      {/if}
    {/if}
  </div>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
  }

  .panel {
    max-width: 860px;
    display: grid;
    gap: 18px;
  }

  p {
    margin: 0;
  }

  .intro,
  .checked,
  .lead,
  .empty,
  .wait {
    color: var(--muted);
  }

  .checked {
    margin-top: -8px;
    font-size: 13px;
  }

  .lead {
    margin-bottom: 4px;
    font-size: 13.5px;
  }

  code {
    padding: 0.05em 0.35em;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--sunken);
    font: 0.88em var(--mono);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .where {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .label {
    font-size: 14px;
    font-weight: 700;
  }

  .location :global(.trigger) {
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    font: 14px var(--mono);
  }

  .filter {
    flex: 1 1 220px;
    min-width: 0;
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font-size: 15px;
  }

  .bar .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 38px;
  }

  .spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .wait {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  section {
    display: grid;
    gap: 8px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 18px;
    font-weight: 900;
  }

  .count {
    padding: 0 8px;
    border-radius: 999px;
    background: var(--sunken);
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 700;
    line-height: 20px;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* MCP servers: one card each, opening onto its tools. */
  .servers {
    display: grid;
    gap: 8px;
  }

  .servers > li {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 10px 14px;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .caret {
    flex: none;
    color: var(--muted);
    transition: transform 0.1s;
  }

  details[open] .caret {
    transform: rotate(90deg);
  }

  .name {
    font-weight: 800;
  }

  .sub {
    flex-basis: 100%;
    padding-left: 20px;
    color: var(--muted);
    font-size: 13px;
  }

  /* Status says itself in words; the dot only backs it up. */
  .status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    font-weight: 700;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted);
  }

  .status.good .dot {
    background: var(--presence);
  }

  .status.warn .dot {
    background: var(--series-4);
  }

  .status.bad {
    color: var(--danger);
  }

  .status.bad .dot {
    background: var(--danger);
  }

  .note {
    margin: 0 14px 10px 34px;
    color: var(--muted);
    font-size: 13px;
  }

  .note.bad {
    color: var(--danger);
  }

  .tools {
    display: grid;
    gap: 8px;
    padding: 4px 14px 12px 34px;
  }

  .tools p {
    margin-top: 2px;
    color: var(--muted);
    font-size: 13px;
  }

  .tag {
    margin-left: 6px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 11.5px;
    white-space: nowrap;
  }

  .tag.bad {
    border-color: var(--danger);
    color: var(--danger);
  }

  /* Skills, agents and commands: a name and a line or two about it. */
  .rows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: 8px;
  }

  .rows li {
    display: grid;
    gap: 4px;
    align-content: start;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .head .tag:last-child {
    margin-left: auto;
  }

  .tag.inline {
    margin-left: 0;
  }

  .desc.none {
    font-style: italic;
  }

  .desc {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    color: var(--muted);
    font-size: 13px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
    gap: 6px 14px;
  }

  .grid li {
    display: grid;
    gap: 1px;
    align-content: start;
    justify-items: start;
    padding: 4px 0;
  }

  .grid span {
    color: var(--muted);
    font-size: 13px;
  }

  .error {
    color: var(--danger);
  }

  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
</style>
