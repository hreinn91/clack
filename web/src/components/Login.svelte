<script lang="ts">
  import { app } from '../lib/state.svelte';

  let token = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      await app.login(token);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <form onsubmit={submit}>
    <h1>clack</h1>
    <p>Enter the access token the server printed when it started.</p>
    <!-- A hidden username lets password managers save the token under a name. -->
    <input type="text" name="username" value="clack" autocomplete="username" hidden />
    <input
      type="password"
      name="token"
      placeholder="Access token"
      autocomplete="current-password"
      aria-label="Access token"
      bind:value={token}
      required
    />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn primary" disabled={busy || !token.trim()}>Sign in</button>
  </form>
</div>

<style>
  .wrap {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 20px;
  }

  form {
    width: min(100%, 360px);
    display: grid;
    gap: 12px;
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
  }

  h1 {
    margin: 0;
    font: 600 22px var(--mono);
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  input {
    min-height: 42px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    font-size: 16px;
  }

  .error {
    color: var(--danger);
  }
</style>
