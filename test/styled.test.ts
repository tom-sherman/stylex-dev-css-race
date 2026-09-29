import { expect, test } from 'vitest';

test('StyleX styles are applied once the module that defines them has evaluated', async () => {
  // Lazily imported, as a React.lazy component or a code-split route would be.
  const { createBox } = await import('../src/styled.ts');
  const box = createBox();
  document.body.append(box);

  expect(getComputedStyle(box).paddingTop).toBe('16px');
});
