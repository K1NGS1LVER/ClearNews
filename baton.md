# Baton: nvim inline image rendering investigation

## STATUS 2026-07-05: fix attempt did not work, paused

The `get_tty`/`kitty_method`/`window_overlap_clear_enabled` fix below was applied and looked correct in a scripted pty test, but the user confirmed after a real restart that it is **still not working**.
No specifics gathered yet on what "not working" means this time (no image at all again? something new/different?) - that's the first thing to establish next session.

Also reverted for now: the HTML tag concealment in `nvim/.config/nvim/lua/plugins/markdown.lua` (the `html.tag = { img = {}, p = {} }` render-markdown.nvim option from fix 3).
With images still not rendering, hiding the raw `<img>`/`<p>` tag text just leaves blank space with no indication anything was ever there, which is worse than showing the tags.
Tags are visible again as of this revert; re-apply concealment only once images are confirmed actually rendering.

The `get_tty` FFI patch, `kitty_method = "unicode-placeholders"`, and `window_overlap_clear_enabled = false` changes in `notebooks.lua` were left in place (not reverted) since they're not the cause of the tag-visibility complaint and may still be partially correct - re-verify them from scratch next session rather than trusting the "RESOLVED" writeup below, which was wrong or at least incomplete.

## Previous (incorrect/incomplete) resolution claim, 2026-07-05

The terminal, tmux, detection, conceal, and render pipeline were all fine.
The images were rendering and then being deleted within the same cycle by image.nvim's own clear commands arriving at Ghostty out of order.

Root cause chain:

1. Neovim 0.11+/0.12 runs plugin Lua inside a separate `nvim --embed` server process (visible in `ps`: a client `nvim .` whose child is `nvim --embed .`).
   The server's own fd 0/1/2 ARE the pane pty (verified with `lsof`), but children spawned via `io.popen` get pipes and a directory as stdio, not the pty.
2. So image.nvim's `get_tty()` (`io.popen("tty")`) returns the literal string `"not a tty"`, which it happily returns as if it were a path (it only guards against empty output).
3. In tmux, `get_clear_tty_override()` in `image/backends/kitty/init.lua` compares the pane tty (`/dev/ttysNNN`) with that garbage `editor_tty`, concludes they differ, and routes every clear/delete as a RAW unwrapped APC (`\e_Ga=d,d=a\e\\`) written directly to the pane tty via `io.open`, while renders go through stdout with proper tmux passthrough wrapping.
4. tmux forwards passthrough-wrapped sequences immediately but pushes the raw APC through its buffered pane-output path, so the delete-all reaches Ghostty AFTER the renders it preceded in code.
   Every render cycle therefore self-destructs: plugin state says `is_rendered = true`, log says success, screen shows nothing.

Proof: a byte-identical placement replayed manually through the live nvim's own `helpers.write`/`write_graphics_at` displayed fine (terminal, tmux passthrough, z-index -1, t=f all healthy), and a forced `clear()` + re-render cycle deleted even unrelated manually-placed test images while showing none of its own, confirming the delete was landing last.

Fixes applied in `~/dotfiles/nvim/.config/nvim/lua/plugins/notebooks.lua`:

- A `config` function now patches `require("image/utils/term").get_tty` before `require("image").setup()` runs, resolving the tty via libc `ttyname(1)` through FFI (fd 1 of the embed server is the pty; `ps -o tty=` does not work, the server has no controlling terminal).
  With a correct `editor_tty`, `get_clear_tty_override()` returns nil and clears travel the same stdout+passthrough channel as renders, in order.
- `kitty_method = "unicode-placeholders"`: images ride the text grid instead of absolute cursor positioning, which is the reliable method under tmux (placements scroll and clip with the pane).
- `window_overlap_clear_enabled = false` committed (previously only toggled live): with `true`, any other open window makes the renderer bail out silently.

Verified via `script`-captured pty run: `get_tty` returns a real `/dev/ttysNNN`, transmits and virtual placements (`U=1`) go out through stdout, no writes carry a tty override.
Needs a final visual confirmation in the user's real session after an nvim restart.

Note for anyone touching this again: magma-nvim was proposed as an alternative and rejected on facts, not preference.
It is the unmaintained predecessor of the already-installed molten-nvim, renders only Jupyter kernel outputs (not markdown files), and its graphics layer is ueberzug, which is X11/Linux-only and cannot display anything on macOS/Ghostty.

## Goal

Make images render inline in Neovim when editing markdown files, specifically this project's `README.md`, which uses raw HTML `<img>` tags (not native `![]()` markdown syntax) wrapped in `<p align="center">` for centered screenshots.

## Environment

Terminal: Ghostty (primary).
Multiplexer: tmux (also tested with no multiplexer at all).
Neovim config: `~/dotfiles/nvim/.config/nvim` (NvChad-based, heavily customized).
Image plugin: `3rd/image.nvim` with `kiyoon/magick.nvim`, backend `kitty`.
Markdown renderer: `MeanderingProgrammer/render-markdown.nvim`.

## Bugs found and fixed so far (all confirmed working, but the image still does not display)

### Fix 1: nvim-treesitter crash on markdown + HTML injection

File: `nvim/.config/nvim/lua/plugins/treesitter.lua`.
Opening any markdown file with an HTML block (like the README's `<img>` tags) crashed treesitter's injection handling with `attempt to call method 'range' (a nil value)`.
Root cause: `nvim-treesitter`'s `master` branch is frozen upstream since May 2025 and only officially supports up to Neovim 0.12.
This machine runs Neovim 0.12.3.
Fixed by migrating to the `main` branch, which is a full rewrite (no more `nvim-treesitter.configs` module; highlighting/indent are now enabled via core `vim.treesitter.start()`/`indentexpr` on `FileType`, and `nvim-treesitter-textobjects` moved to explicit keymaps).
Verified: the crash is gone, all languages still highlight/indent/inject correctly, textobjects still work.

### Fix 2: image.nvim never detects raw HTML `<img>` tags

File: `nvim/.config/nvim/lua/image/integrations/markdown_html.lua` (new), registered in `nvim/.config/nvim/lua/plugins/notebooks.lua`.
`image.nvim`'s built-in `markdown` integration only queries the `markdown_inline` treesitter tree for native `![alt](url)` syntax.
It never looks at the injected `html` tree at all, so raw `<img>` tags are invisible to it regardless of terminal.
Confirmed no upstream fix exists (checked `image.nvim`'s master branch history for the integration file, 0 relevant commits).
Fixed by writing a second integration that walks the `html` injection tree, finds every `<img>` element, and correlates each to its `src` attribute by walking the treesitter parent chain (attribute order in the tag is arbitrary, so this can't be a single anchored query pattern).
Verified via headless test and via live debug logging in the user's actual running session: all 5 images in the real README are detected with correct `src` paths and correct buffer ranges.

### Fix 3: raw HTML tag text was never concealed

File: `nvim/.config/nvim/lua/plugins/markdown.lua`.
Even after fix 2, the raw `<img src="..." ...>` and `<p align="center">`/`</p>` tag text stayed fully visible in the buffer, because nothing conceals HTML tags (unlike native `![]()` syntax, which `render-markdown.nvim` already conceals, leaving blank cells for the image to show through, since Kitty-protocol images draw at z-index -1, behind normal cell text).
Fixed by adding `html = { tag = { img = {}, p = {} } }` to `render-markdown.nvim`'s config, which is a documented built-in mechanism for concealing named HTML tag start/end markers.
Verified via headless test: conceal extmarks now correctly apply over all three HTML tag lines in the real README.
User confirmed live: the tags are now visibly hidden/concealed.

## The unsolved problem

Despite all three fixes being individually verified correct, **the image itself still never visually appears**, in tmux or outside tmux, for the custom HTML-tag integration.

What has been conclusively ruled out, with evidence:

- **Terminal/tmux passthrough capability.** `kitten icat <path>` (Kitty terminal's own reference CLI tool, already installed) successfully displays the exact same image file, both inside the user's tmux session and in a completely fresh Ghostty window with no tmux at all. Ghostty's Kitty graphics protocol support is not the problem.
- **tmux `allow-passthrough`.** Already set to `on` in the committed `tmux/.tmux.conf`, confirmed live on the running tmux server (`tmux show -Apv allow-passthrough` returns `on`).
- **Detection logic.** Directly connected to the user's live running nvim process via `nvim --server <socket> --remote-expr` (found the real PID and its auto-created Neovim RPC socket under `$TMPDIR/nvim.<user>/*/nvim.<pid>.0`). Confirmed the custom `markdown_html` integration's query correctly finds all 5 `<img>` tags with correct `src` values and buffer ranges, live, in the actual open README buffer.
- **The render pipeline itself, per image.nvim's own internal state.** Enabling debug logging on the *correct* module instance (image.nvim's internal code uses `require("image/utils/logger")` with slashes; using `require("image.utils.logger")` with dots creates an entirely separate, disconnected module instance in Lua's `package.loaded` cache, silently logging to nowhere real. This cost significant time before being caught.) shows, for the in-viewport image (`landing.png`):
  - detection succeeds (`Found matches {count=5}`)
  - file loading succeeds (`Image created successfully`)
  - the renderer computes valid geometry and does not bail out on any of its early-return checks (window valid, window visible, buffer matches, not overlapped, not in a fold, in viewport)
  - the Kitty graphics protocol control payload is built and written (`write_graphics`, `write {payload_len=...}`, `transmitted image ...`)
  - the function returns success and `image.is_rendered` becomes `true`
  - no errors anywhere in the log
- **`window_overlap_clear_enabled`.** This global image.nvim option (found set to `true` in the committed config) makes the renderer bail out silently (`"overlap"`, `#window.masks > 0`) whenever *any other window is visible at all*, not just windows that are actually visually overlapping the image's screen region. The user's normal nvim layout has multiple windows/splits open. Confirmed this was blocking rendering by toggling it off live (`require("image").setup({window_overlap_clear_enabled = false})`) and re-triggering: internal state then reports `is_rendered = true` for images in both a split showing the README and a split showing a plain native `![]()` test image of the same file. Even with this disabled, in a live multi-window layout, **the user still saw nothing in either pane.**
- **The problem is not specific to the custom HTML integration.** A minimal test file (`/tmp/native_img_test.md`, plain `![landing page](/path/to/landing.png)`, no HTML at all) was opened in a vertical split next to the README, in the user's actual live session. Neither image displayed. This means the bug is not in anything written this session (the treesitter migration, the HTML detection integration, or the conceal config) - it reproduces with image.nvim's own well-established, built-in, unmodified `markdown` integration too, as soon as more than one window is open.
- Earlier in the investigation, the user reported that a plain native `![]()` test file opened **alone, with no other splits**, did render correctly, both inside and outside tmux. This was not independently re-verified after the multi-window finding above; it should be re-confirmed as a clean baseline (single window, nothing else open, fresh nvim restart) before trusting it as "the one working case."

## Leading hypothesis

Something about having more than one nvim window/split open causes images to stop rendering, even after disabling the one config option (`window_overlap_clear_enabled`) that explicitly gates on window count/overlap. This suggests either:

1. There is a **second, different code path** in image.nvim (not the `window_overlap_clear_enabled` check already found and disabled) that also suppresses rendering based on window layout, focus, or redraw state, not yet located.
2. Something in **this specific dotfiles nvim config** (not image.nvim itself) is clearing or overwriting the terminal region after a successful write, on some redraw-triggering event that only fires/matters when multiple windows exist. This config has unusually heavy custom redraw-adjacent logic: a hand-rolled statusline color system and a "clear all backgrounds for transparency" system in `nvim/.config/nvim/lua/autocmds.lua`, both firing on `VimEnter`/`ColorScheme`, plus NvChad's own tabufline/statusline machinery. None of this has been tested as a suspect yet.
3. A genuine Ghostty-level issue that only manifests with multiple Neovim windows in play (for example, incorrect coordinate/offset calculation when more than one window's screen position needs to be accounted for), even though `kitten icat` alone (no nvim, no multi-window layout) works fine.

## Recommended next steps, in priority order

1. **Re-establish the clean baseline.** Fully quit nvim. Open *only* `/tmp/native_img_test.md`, nothing else, no splits, fresh terminal, both inside and outside tmux. Confirm with fresh eyes whether the image renders. This re-validates or invalidates the single-window-works claim before building further on it.
2. **Bisect this dotfiles config.** Launch `nvim --clean -u NONE` plus a tiny standalone init that only loads `lazy.nvim`, `image.nvim`, `magick.nvim`, and `render-markdown.nvim` with minimal opts (no NvChad, no custom autocmds, no statusline/transparency system). Open the same multi-window layout (README + native test side by side) in that minimal config. If images now render, the bug is in this repo's nvim config, not image.nvim, and the next step is to bisect `autocmds.lua`'s custom redraw logic specifically (try commenting out the transparency-clearing and statusline-color autocmds first, since those are the most exotic, highest-frequency custom redraw code in this config).
3. **Try `kitty_method = "unicode-placeholders"`** in `image.nvim`'s opts as an A/B test. This is a structurally different rendering technique (placeholder characters with foreground-color-encoded image IDs, rendered through the normal text grid) that avoids some of the absolute-cursor-position and z-order assumptions of the default `"normal"` method, and would help confirm whether this is a z-order/redraw-clobbering problem specifically.
4. **Look for a second overlap/visibility gate.** Read further through `~/.local/share/nvim/lazy/image.nvim/lua/image/renderer.lua` past line 219 (truncated during this investigation) and `~/.local/share/nvim/lazy/image.nvim/lua/image/utils/window.lua`'s window-visibility/mask computation, specifically for any check that depends on window *count* or *focus* rather than actual pixel overlap.
5. **Compare raw bytes.** Capture the exact escape sequence bytes `kitten icat` writes (known-working) against the exact bytes image.nvim writes (logged payload lengths are visible already: `write {payload_len=242}` then `write {payload_len=94}` for the two-part kitty transmit+display sequence) to check for a protocol-level discrepancy Ghostty might be silently rejecting only when it arrives via image.nvim's write path.
6. Consider searching image.nvim's GitHub issues for "renders successfully internally but nothing visible" or "Ghostty" reports; this exact failure signature (plugin state says success, terminal shows nothing, only when 2+ windows are open) is specific enough that it may already be a known, reported issue.

## Full chronological list of diagnostic attempts

Every method tried, in order, including dead ends. Reuse the commands directly; do not re-derive them.

1. **Reproduced the original treesitter crash headlessly.**
   `nvim --headless README.md -c "lua vim.treesitter.get_parser(0):parse(true)" -c "redraw!" -c "qa!"` reproduced the exact stack trace from the user's screenshot. This confirmed the bug before touching any config.

2. **Checked for an upstream nvim-treesitter fix.**
   `cd ~/.local/share/nvim/lazy/nvim-treesitter && git fetch origin master && git log --oneline <pinned-commit>..origin/master -- lua/nvim-treesitter/query_predicates.lua` returned nothing relevant, and revealed the `master` branch is frozen (`git log --oneline -5 origin/master` showed the freeze-announcement commit one past the pinned commit). Also checked `origin/main`'s README via `git fetch origin main && git show origin/main:README.md` to get the real, current setup API before writing the migration.

3. **Verified the treesitter migration.**
   Reinstalled only the two affected plugins (`nvim --headless "+Lazy! update nvim-treesitter nvim-treesitter-textobjects" +qa`, after first `git checkout -- lazy-lock.json` and `+Lazy! restore` to undo an earlier accidental `Lazy! sync` that bumped unrelated plugins). Forced synchronous parser install for testing with `require('nvim-treesitter').install({...}):wait(180000)`. Re-ran the original crash repro and confirmed no error. Spot-checked Python/Lua/Markdown+codefence files for highlighting regressions. Tested `]m`/`]]` textobject motions functionally (moved cursor between two Python functions and checked `nvim_win_get_cursor`).

4. **Found image.nvim never detects HTML `<img>` tags.**
   Read `~/.local/share/nvim/lazy/image.nvim/lua/image/integrations/markdown.lua` directly and saw the query only matches `(image (link_destination) @url)` in the `markdown_inline` tree, nothing HTML-related. Checked for an upstream fix the same way as step 2 (none). Dumped the actual html-tree structure for a real `<img>` tag with:
   `vim.treesitter.get_parser(0, 'markdown'):children()['html']:trees()[1]:root():sexpr()`
   to see the real node shape (`element > start_tag > tag_name` + `attribute > attribute_name`/`quoted_attribute_value > attribute_value`) before writing the query.

5. **Wrote and unit-tested the html-image query in isolation before wiring it into image.nvim.**
   Wrote the detection algorithm as a standalone `.lua` file and ran it via `nvim --headless -n README.md -c "luafile /tmp/test.lua" -c qa!` against the real file. First version returned 0 matches. Debugged by re-checking the exact parent-chain hop count needed (`tag_name -> start_tag -> element` is *two* `:parent()` calls, not one; `attribute_name -> attribute -> start_tag -> element` for the src lookup, and the sibling to read the value is `attribute_name:next_named_sibling()`, not `attribute_name:parent():next_named_sibling()`). Fixed both bugs, reran, got exactly 5 correct matches with correct `src` values and ranges.

6. **Wired the fixed query into a real image.nvim integration and verified via the plugin's own pipeline, not just the standalone script.**
   `query_buffer_images` is a private closure inside `document.create_document_integration` and is not exposed on the returned integration table, so it cannot be called or monkey-patched directly from outside. Verified it indirectly by enabling image.nvim's built-in debug logger and reading the resulting log, and separately by stubbing `package.loaded["image/utils/document"]` to capture the closure for a synthetic-file unit test (this stub trick is what `scripts/doctor`'s markdown_html check now uses).

7. **First live-session connection.**
   Found the user's real running nvim process from outside, without asking them to run anything special:
   `tmux list-panes -a -F "#{pane_id} #{pane_pid} #{pane_current_command}"` to find the pane, `ps -o pid,ppid,command -A | grep '<pane_pid> '` to find the actual nvim child PID (the pane runs a shell, not nvim, directly), then `find "$TMPDIR/nvim.$(whoami)" -mmin -30` to find the freshest RPC socket, then `nvim --server <socket> --remote-expr "luaeval('...')"` to run arbitrary Lua in the live process.

8. **First debug-logging attempt failed silently, wasting significant time.**
   Called `require("image.utils.logger").setup({enabled=true, ...})` (dot-separated require). Test log lines written through that same dotted path appeared in the log file, giving false confidence that logging worked. Real render calls produced *zero* log lines. Root cause found by re-reading image.nvim's own source: every internal file uses slash-separated requires (`require("image/utils/logger")`). Dot-style and slash-style are different `package.loaded` cache keys in Lua even though they resolve to the same file on disk, so the dotted call had configured a completely disconnected, inert duplicate module instance. Re-did logging setup with the slash-separated path and immediately got real output.

9. **Confirmed the render pipeline succeeds internally, once logging was actually working.**
   `require("image").clear()` + `vim.api.nvim_exec_autocmds("BufWinEnter", {buffer=<bufnr>})` to force a fresh render cycle, then read `/tmp/live_image_debug_real.log`. First attempt happened to inspect an image that was legitimately scrolled below the viewport (`get_images()[1]` is not stable/ordered, picked the wrong one) and showed `is_rendered=false` with log line `"is below viewport"`, a false alarm. Re-ran targeting the specific image known to be on-screen (matched by `id:match(":7:")`, the row number) and got a full success trace: `Found matches {count=5}` -> `Image created successfully` -> `rendering to backend` -> `write_graphics`/`write`/`transmitted image` -> `rendered` -> `success: true`.

10. **Used the built-in diagnostic report tool.**
    `require("image").create_report()` returns a *buffer number*, not a string (first attempt treated it as a string and got the literal text "4"). Correct usage: `vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)`. The report confirmed active backend `kitty`, `magick_cli` processor working, both integrations correctly configured, and listed all 5 tracked images with `Rendered: false` at that point in time (before the viewport-targeting fix in step 9). The report's `Kitty PID: N/A` field looked suspicious at first but turned out to be a red herring: it just reads the `$KITTY_PID` env var, which only the actual Kitty terminal sets, not Ghostty (which implements the same protocol without that variable). Not load-bearing for anything.

11. **Ruled out terminal/tmux entirely.**
    Asked the user to run `kitten icat <path-to-landing.png>` themselves, directly, in two contexts: inside the tmux nvim pane, and in a fresh Ghostty window with no tmux. Confirmed working in both. This is the single most useful checkpoint for a fresh session: if this ever stops working, the bug moved to the terminal/tmux layer; as of this session it was fine.

12. **Root-caused the missing conceal.**
    Compared: native images show correctly (their markdown source gets concealed by `render-markdown.nvim`, leaving blank cells for a z-index -1 Kitty image to show through); HTML `<img>` tags do not get concealed by anything, so nvim keeps redrawing the literal tag text on top of the image on every screen refresh. Found `render-markdown.nvim`'s documented `html.tag` config (`~/.local/share/nvim/lazy/render-markdown.nvim/lua/render-markdown/settings.lua` around line 1001, and the renderer at `.../render/html/tag.lua`) which conceals a named HTML tag's start/end markers. Verified extmarks were actually applied with:
    `vim.api.nvim_buf_get_extmarks(0, -1, {6,0}, {8,0}, {details=true})`, filtering for `.conceal ~= nil`.

13. **Conceal fix did not resolve visibility.** User confirmed tags now hide correctly, image still does not appear, in tmux and outside it.

14. **Re-traced live with the conceal fix active.** Found the user had closed and reopened nvim (old socket dead, `E247: connection refused`), located the new socket the same way as step 7, redid the slash-path logger setup (step 8's fix), redid the targeted render trace (step 9's fix). Same result as before: full internal success, still no visible image reported by the user.

15. **Controlled side-by-side comparison, in the user's real live session.**
    `nvim --server <socket> --remote-send ":vsplit /tmp/native_img_test.md<CR>"` to open a plain native-syntax test image right next to the real README, so both would render under identical window/terminal conditions. First screenshot from the user showed the *native* pane displaying raw unconcealed markdown syntax, which was initially confusing; turned out to be expected `render-markdown.nvim` behavior (it always un-conceals whichever line the cursor is currently sitting on, and the `:vsplit` command had left the cursor on the image line). Corrected with `:normal! G` sent via `--remote-send` to move the cursor away. User reported: still nothing in either pane.

16. **Found and disabled `window_overlap_clear_enabled` live.**
    Traced further into `~/.local/share/nvim/lazy/image.nvim/lua/image/renderer.lua` (the early-return conditions after the viewport check) and found it bails out whenever `#window.masks > 0`. Directly inspected the actual window's masks with:
    `require("image.utils").window.get_window(1000, {with_masks=true, ignore_masking_filetypes={...}})`
    and saw non-empty masks purely from *other, non-overlapping* adjacent split windows being open, which is the user's normal layout. First attempt to disable it live was wrong (`require("image").setup({integrations={markdown={window_overlap_clear_enabled=false}}})`; this option is a top-level config key, not per-integration, so it silently did nothing). Corrected to `require("image").setup({window_overlap_clear_enabled = false})`, cleared, and re-triggered both the README and the native test image. Internal state then reported `is_rendered = true` for both. User confirmed: still nothing visible in either pane. This was the point the investigation was paused and this baton file was written.

## Live debugging technique notes (useful for next session)

- Find the user's actual running nvim process and its RPC socket without asking them to do anything special:
  ```
  tmux list-panes -a -F "#{pane_id} #{pane_pid} #{pane_current_command}"
  # find the real nvim PID under that pane's pid tree with ps
  find "$TMPDIR/nvim.$(whoami)" -mmin -30   # find the freshest auto-created socket
  nvim --server <socket> --remote-expr "luaeval('...')"
  ```
- Always require internal modules with the exact same path style the plugin itself uses. This codebase uses slash-style requires (`require("image/utils/logger")`), not dot-style (`require("image.utils.logger")`). These are different `package.loaded` cache keys in Lua even though both resolve to the same file, so using the wrong style silently creates a disconnected, non-functional duplicate module instance. This cost real time in this session; check the plugin's own source for its require style before assuming dot-style is safe.
- `tmux capture-pane -p` only ever shows the character grid, never actual terminal graphics. It is useless for confirming whether a Kitty-protocol image is visually present, only for confirming the surrounding text/concealment state.
- image.nvim exposes `require("image").create_report()`, which opens a scratch buffer (returns a buffer number, not a string) with a full diagnostic dump: system info, full resolved config, active processor/backend, and every currently tracked image's rendered state. Read it with `vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)`, not by treating the return value as a string.

## Files changed this session

- `nvim/.config/nvim/lua/plugins/treesitter.lua` - migrated `nvim-treesitter` + `nvim-treesitter-textobjects` to the `main` branch.
- `nvim/.config/nvim/lua/image/integrations/markdown_html.lua` (new) - detects raw HTML `<img>` tags in markdown.
- `nvim/.config/nvim/lua/plugins/notebooks.lua` - registers the new `markdown_html` integration.
- `nvim/.config/nvim/lua/plugins/markdown.lua` - conceals `img`/`p` HTML tags via `render-markdown.nvim`'s `html.tag` config.
- `~/dotfiles/scripts/doctor` - gained checks for the treesitter branch and the markdown+HTML crash/detection regressions.

All of the above are committed to the `dotfiles` repo and confirmed individually correct; none of them are suspected of causing the remaining problem, since it reproduces with plain native `![]()` syntax and the plugin's own unmodified built-in integration too.

## Loose ends to clean up

- `/tmp/native_img_test.md` still exists and is still open in a vertical split in the user's live nvim session from the side-by-side comparison test.
- That live session currently has `window_overlap_clear_enabled` overridden to `false` in memory only (via a live `require("image").setup(...)` call). This does not persist. A restart reverts to the committed config's default of `true`. Whether to change the committed default given finding #`window_overlap_clear_enabled` above is an open decision, not yet made or discussed with the user.
