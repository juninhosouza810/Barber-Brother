// Cor de destaque do layout, escolhida por cada salão nas Configurações.
// Aplica as variáveis CSS (--gold, --gold-soft, --gold-dim...) a partir de uma cor hex.

export const DEFAULT_THEME = '#e3a58f';

export const THEME_PRESETS = [
  { name: 'Rosé', color: '#e3a58f' },
  { name: 'Dourado', color: '#d4af37' },
  { name: 'Lilás', color: '#b48ee6' },
  { name: 'Pink', color: '#f06aa6' },
  { name: 'Vermelho', color: '#e5534b' },
  { name: 'Laranja', color: '#f0883e' },
  { name: 'Verde', color: '#3fbf7f' },
  { name: 'Turquesa', color: '#2ec4c4' },
  { name: 'Azul', color: '#4f8ff7' },
  { name: 'Prata', color: '#c0c4cc' },
];

export const isHexColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (rgb, target, t) => rgb.map((v, i) => v + (target[i] - v) * t);

// Luminância relativa (WCAG) para escolher texto claro ou escuro sobre a cor.
function luminance([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function applyTheme(color) {
  const hex = isHexColor(color) ? color : DEFAULT_THEME;
  const rgb = toRgb(hex);
  const [r, g, b] = rgb;
  const root = document.documentElement.style;
  root.setProperty('--gold', hex);
  root.setProperty('--gold-soft', toHex(mix(rgb, [255, 255, 255], 0.3)));
  root.setProperty('--gold-dim', `rgba(${r}, ${g}, ${b}, 0.16)`);
  root.setProperty('--gold-glow', `rgba(${r}, ${g}, ${b}, 0.18)`);
  // Texto escuro (tom da própria cor) ou branco — o que tiver mais contraste.
  const dark = mix(rgb, [0, 0, 0], 0.82);
  const L = luminance(rgb);
  const vsWhite = 1.05 / (L + 0.05);
  const vsDark = (L + 0.05) / (luminance(dark) + 0.05);
  root.setProperty('--on-gold', vsDark >= vsWhite ? toHex(dark) : '#ffffff');
}
