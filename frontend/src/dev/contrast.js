// WCAG 2.x relative luminance and contrast ratio.
function channel(c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

export function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Resolve any CSS colour the browser understands (oklch included) to sRGB by painting it.
export function toRgb(cssColor) {
  const ctx = document.createElement('canvas').getContext?.('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

// OKLCH -> linear sRGB (unclamped, so callers can check gamut).
export function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

export function oklchContrast(a, b) {
  const lum = ([r, g, bl]) => {
    const [x, y, z] = [r, g, bl].map((v) => Math.min(1, Math.max(0, v)))
    return 0.2126 * x + 0.7152 * y + 0.0722 * z
  }
  const [hi, lo] = [lum(oklchToLinear(...a)), lum(oklchToLinear(...b))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
