/** Inline Nano Arcade SVG assets — no external hosting. */

export function mountSvg(svg: string, className?: string): SVGSVGElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = svg.trim();
  const node = wrap.firstElementChild;
  if (!(node instanceof SVGSVGElement)) {
    throw new Error('mountSvg: expected root SVG element');
  }
  if (className) node.setAttribute('class', className);
  return node;
}

/** Synthwave perspective grid (used as CSS data-uri in styles.css). */
export const SYNTHWAVE_GRID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" preserveAspectRatio="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050014"/>
      <stop offset="100%" stop-color="#1a0033"/>
    </linearGradient>
    <linearGradient id="gridGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF00FF" stop-opacity="0"/>
      <stop offset="100%" stop-color="#00FFFF" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <g stroke="url(#gridGlow)" stroke-width="2">
    <line x1="0" y1="300" x2="800" y2="300" opacity="0.2"/>
    <line x1="0" y1="330" x2="800" y2="330" opacity="0.3"/>
    <line x1="0" y1="370" x2="800" y2="370" opacity="0.5"/>
    <line x1="0" y1="430" x2="800" y2="430" opacity="0.7"/>
    <line x1="0" y1="520" x2="800" y2="520" opacity="1"/>
  </g>
  <g stroke="#00FFFF" stroke-width="1.5" opacity="0.4">
    <path d="M400,300 L-200,600 M400,300 L0,600 M400,300 L200,600 M400,300 L400,600 M400,300 L600,600 M400,300 L800,600 M400,300 L1000,600"/>
  </g>
</svg>`;

export function synthwaveGridDataUri(): string {
  return `data:image/svg+xml,${encodeURIComponent(SYNTHWAVE_GRID_SVG)}`;
}

/** Alliance Banana (red faction / faction A). */
export const BANANA_EMBLEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
  <defs>
    <filter id="neonYellow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <polygon points="50,5 95,25 95,75 50,95 5,75 5,25" fill="#0A0A0A" stroke="#00FFFF" stroke-width="3"/>
  <path d="M25,80 Q15,40 40,20 Q65,30 75,70 Q50,95 25,80 Z" fill="none" stroke="#FAED27" stroke-width="4" filter="url(#neonYellow)"/>
  <rect x="42" y="35" width="28" height="8" rx="2" fill="#00FFFF" stroke="#FFFFFF" stroke-width="1"/>
</svg>`;

/** Syndicate Coconut (blue faction / faction B). */
export const COCONUT_EMBLEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
  <defs>
    <filter id="neonOrange">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <polygon points="50,5 95,25 95,75 50,95 5,75 5,25" fill="#0A0A0A" stroke="#FF00FF" stroke-width="3"/>
  <circle cx="50" cy="50" r="28" fill="none" stroke="#FF5500" stroke-width="4" filter="url(#neonOrange)"/>
  <circle cx="50" cy="45" r="7" fill="#FF0055" stroke="#FFFFFF" stroke-width="1"/>
  <line x1="32" y1="45" x2="43" y2="45" stroke="#FF0055" stroke-width="2"/>
  <line x1="57" y1="45" x2="68" y2="45" stroke="#FF0055" stroke-width="2"/>
</svg>`;

/** Assassin / virus tile icon. */
export const ASSASSIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
  <rect x="10" y="10" width="80" height="80" rx="10" fill="#111" stroke="#FF0055" stroke-width="4" stroke-dasharray="10 5"/>
  <path d="M35,40 L45,50 L35,60 M65,40 L55,50 L65,60" stroke="#FF0055" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M25,75 L40,75 L50,60 L60,85 L70,75 L75,75" stroke="#00FFFF" stroke-width="3" stroke-linejoin="round" fill="none"/>
</svg>`;

export function nanoEmblem(faction: 'red' | 'blue', className = 'nano-emblem'): SVGSVGElement {
  const svg = faction === 'red' ? BANANA_EMBLEM_SVG : COCONUT_EMBLEM_SVG;
  return mountSvg(svg, className);
}

export function nanoAssassinIcon(className = 'grid-tile__assassin-icon'): SVGSVGElement {
  return mountSvg(ASSASSIN_ICON_SVG, className);
}
