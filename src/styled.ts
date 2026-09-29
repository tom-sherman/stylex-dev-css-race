import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  box: { paddingTop: '16px' },
});

export function createBox(): HTMLElement {
  const box = document.createElement('div');
  box.className = stylex.props(styles.box).className ?? '';
  box.textContent = 'StyleX box';
  return box;
}
