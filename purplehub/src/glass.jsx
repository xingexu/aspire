// Mounts liquid-glass-react around the two pieces of floating chrome: the tab bar and the tour card.
// The page itself stays vanilla. Each piece is plain HTML that already works and is styled with CSS glass, so if
// this file is missing or fails, or the viewer asks for less transparency, nothing breaks.
// Rebuild after editing: npm run build:glass (writes glass.bundle.js, which is committed so npm start needs no packages).
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import LiquidGlass from 'liquid-glass-react';

// LiquidGlass renders its children, so hand it the existing element instead of a copy.
function Slot({ node }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.appendChild(node); }, [node]);
  return <div ref={ref} className="lg-slot" />;
}

function mount(anchor, props) {
  const node = anchor.firstElementChild;
  node.remove();
  // top and left must be strings: the library treats a numeric 0 as unset and falls back to 50%.
  flushSync(() => {
    createRoot(anchor).render(
      <LiquidGlass padding="0" {...props}>
        <Slot node={node} />
      </LiquidGlass>
    );
  });
  // The library only measures itself on window resize, and these pieces change size without one.
  new ResizeObserver(() => window.dispatchEvent(new Event('resize'))).observe(node);
}

function start() {
  if (matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  mount(document.getElementById('tab-anchor'), {
    style: { position: 'fixed', top: 'var(--tab-y)', left: '50%' },
    cornerRadius: 999, displacementScale: 48, blurAmount: 0.4, saturation: 170, aberrationIntensity: 1.5, elasticity: still ? 0 : 0.12,
  });
  mount(document.getElementById('tour-anchor'), {
    style: { position: 'absolute', top: '0px', left: '0px' },
    cornerRadius: 28, displacementScale: 36, blurAmount: 0.7, saturation: 170, aberrationIntensity: 1, elasticity: 0,
  });
  // Safari and every iPhone browser run WebKit, which drops the blur when this layer also has the displacement filter.
  // There, keep the frost and rim and let the CSS rule for .lg-frost-only turn the displacement off.
  const root = document.documentElement;
  if (/Apple/.test(navigator.vendor)) root.classList.add('lg-frost-only');
  root.classList.add('lg-on');
}

try { start(); } catch (e) { console.warn('Liquid glass unavailable, using CSS glass.', e); }
