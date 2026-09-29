// Once the page has settled, lazily import a module that uses StyleX, as a test
// runner or a code-split route does, and check whether its styles are applied by
// the time it has evaluated.

const log = document.getElementById('log')!;
const button = document.getElementById('load') as HTMLButtonElement;

button.addEventListener('click', async () => {
  button.disabled = true;
  const t0 = performance.now();
  const line = (message: string) => {
    log.textContent += `${(performance.now() - t0).toFixed(0).padStart(5)}ms  ${message}\n`;
  };

  const { createBox } = await import('./styled.ts');
  const box = createBox();
  document.body.append(box);

  const atEvaluation = getComputedStyle(box).paddingTop;
  line(`module evaluated, padding-top: ${atEvaluation} (expected 16px)`);

  // The CSS does arrive, just later: wait for it to show by how much.
  await new Promise<void>((resolve) => {
    const check = () => {
      if (getComputedStyle(box).paddingTop === '16px') resolve();
    };
    new MutationObserver(check).observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    check();
  });
  const lateBy = performance.now() - t0;
  line('padding-top: 16px, StyleX CSS applied');

  Object.assign(window, { __result: { atEvaluation, lateBy } });
});
