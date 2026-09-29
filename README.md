# StyleX dev CSS arrives after the module that defines it has evaluated

Minimal reproduction for `@stylexjs/unplugin` with Vite in dev mode. When a module that uses StyleX is loaded after the page has started, its CSS is not applied when that module evaluates. It arrives some time later, anywhere from a few milliseconds to a little over 150ms.

Only Vite and `@stylexjs/unplugin` are involved; React, Storybook and Vitest are not needed to trigger it. Vitest is here to show the most visible consequence: a browser test that checks styles fails.

## Reproduce

```sh
pnpm install
pnpm exec playwright install chromium
```

**In a browser:** run `pnpm dev`, open the page, and click the button. It lazily imports [`src/styled.ts`](src/styled.ts), renders its element, reads `padding-top` straight away, and then logs when the style actually shows up. Restart the dev server between tries: the plugin keeps its rules for the life of the Node process, so only the first load after a restart shows the race.

**Headless, many runs:** `pnpm repro 20` repeats the above against a fresh dev server in a fresh Node process each time. Typical output:

```
run  1: padding-top when the module evaluated: 0px  FAIL  (styles applied 149ms after the import started)
run  2: padding-top when the module evaluated: 0px  FAIL  (styles applied 142ms after the import started)
run  3: padding-top when the module evaluated: 16px ok
...
6/10 runs had no StyleX CSS when the module evaluated
```

**Vitest browser mode:** `pnpm test` fails every time:

```
AssertionError: expected '0px' to be '16px' // Object.is equality
```

## Expected

Once a module that calls `stylex.create` has evaluated, its styles are applied. That is how Vite's own CSS handling behaves: an imported stylesheet is injected before the importing module runs.

## Actual

In dev, the CSS is delivered outside Vite's module graph (references are to [`facebook/stylex@fe0be7f`](https://github.com/facebook/stylex/tree/fe0be7f0e76ccc585385f0fa56d9b50053ff9ca2/packages/%40stylexjs/unplugin/src)):

1. `transformIndexHtml` injects a runtime script and a `<link>` to `/virtual:stylex.css` ([`vite.js#L122`](https://github.com/facebook/stylex/blob/fe0be7f0e76ccc585385f0fa56d9b50053ff9ca2/packages/%40stylexjs/unplugin/src/vite.js#L122)).
2. The runtime fetches the collected CSS once when the page loads ([`consts.js#L64`](https://github.com/facebook/stylex/blob/fe0be7f0e76ccc585385f0fa56d9b50053ff9ca2/packages/%40stylexjs/unplugin/src/consts.js#L64)). After that it only fetches again when it receives a `stylex:css-update` HMR event ([`consts.js#L67`](https://github.com/facebook/stylex/blob/fe0be7f0e76ccc585385f0fa56d9b50053ff9ca2/packages/%40stylexjs/unplugin/src/consts.js#L67)).
3. The server sends that event from a `setInterval` that checks every 150ms whether the rule store has changed ([`vite.js#L80`](https://github.com/facebook/stylex/blob/fe0be7f0e76ccc585385f0fa56d9b50053ff9ca2/packages/%40stylexjs/unplugin/src/vite.js#L80)).

Vite compiles modules when the browser first asks for them. For a module loaded after the page has started, its rules are collected after the runtime's first fetch, and they reach the page one poll tick, one WebSocket message and one fetch later. The module has already evaluated and rendered by then. So in practice:

- **Apps** show a flash of unstyled content on lazily loaded routes and components, and anything that measures layout on mount (`useLayoutEffect`, positioning, virtualisation) gets unstyled numbers.
- **Browser tests** (Vitest browser mode, Storybook interaction tests) intermittently assert against missing styles, depending on how the test's module graph happens to race the runtime's first fetch.
- **Storybook** renders a story without its StyleX CSS when you switch to a story whose file hasn't been loaded yet. In a real Storybook 10 project this happened in 4 of 5 cold starts, and the unstyled state lasted 11–122ms. A `play` function runs inside that window.

## Environment

- `@stylexjs/unplugin` 0.19.1 and `@stylexjs/stylex` 0.19.1. The dev runtime on `main` as of `fe0be7f` is unchanged.
- Vite 8.3.1, Vitest 5.0.2 with `@vitest/browser-playwright`
- Chromium (Playwright headless shell 153), Node 26.7.0, macOS

## Notes

- The rule store lives on `globalThis.__stylex_unplugin_store` ([`core.js#L259`](https://github.com/facebook/stylex/blob/fe0be7f0e76ccc585385f0fa56d9b50053ff9ca2/packages/%40stylexjs/unplugin/src/core.js#L259)). It survives `server.close()` and a new `createServer()` in the same process, which is why `repro.mjs` starts a new process for every run. A second server in the same process never shows the race.
- Making the server push immediately after a transform, instead of polling, would narrow the window without closing it, because the fetch is still asynchronous relative to module evaluation. Closing it needs the CSS to be part of the module graph in dev. For example, a StyleX-transformed module could import a virtual CSS module that Vite's CSS HMR injects before the importer runs.
