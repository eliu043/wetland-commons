// Native emoji use Apple's color glyphs on iOS/macOS, with platform fallbacks.
export const EMOJI = {
  oyster: '🦪',
  shrimp: '🦐',
  alligator: '🐊',
  marsh: '🌾',
  breach: '🌊'
};
export function icon(name, className = '') {
  return `<span class="wildlife-icon ${className}" aria-hidden="true">${EMOJI[name]}</span>`;
}
export function paintIcon(ctx, name, x, y, size, color, stressed = false, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size * .88}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(EMOJI[name], x + size / 2, y + size / 2);
  if (stressed) {
    ctx.strokeStyle = '#ffe1a1'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
    ctx.strokeRect(x, y, size, size);
  }
  ctx.restore();
}
