import { useEffect, useRef } from "react";

/*
  SmartFarm UI Enhancements
  - Responsive mobile layout
  - Desktop-only cursor sparkle
  - Visual-only: does not touch API, sensor, navigation, or backend logic
*/

export default function UIEnhancements() {
  const layerRef = useRef(null);
  const cursorRef = useRef(null);

  useEffect(() => {
    const finePointer =
      window.matchMedia("(hover: hover) and (pointer: fine)");

    if (!finePointer.matches) return;

    const layer = layerRef.current;
    const cursor = cursorRef.current;

    if (!layer || !cursor) return;

    let lastSparkle = 0;

    const move = (event) => {
      const x = event.clientX;
      const y = event.clientY;

      cursor.style.transform =
        `translate3d(${x}px, ${y}px, 0)`;

      const now = performance.now();

      if (now - lastSparkle < 45) return;
      lastSparkle = now;

      const particle = document.createElement("span");
      const isLeaf = Math.random() < 0.18;
      particle.className = isLeaf
        ? "smartfarm-cursor-particle smartfarm-cursor-leaf"
        : "smartfarm-cursor-particle";

      const angle = Math.random() * Math.PI * 2;
      const distance = 7 + Math.random() * 17;

      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty(
        "--dx",
        `${Math.cos(angle) * distance}px`
      );
      particle.style.setProperty(
        "--dy",
        `${Math.sin(angle) * distance}px`
      );

      layer.appendChild(particle);

      window.setTimeout(() => {
        particle.remove();
      }, 650);
    };

    window.addEventListener("mousemove", move, {
      passive: true,
    });

    return () => {
      window.removeEventListener("mousemove", move);
    };
  }, []);

  return (
    <>
      <style>{`
        /* =====================================================
           SMARTFARM RESPONSIVE UI
           ===================================================== */

        html,
        body,
        #root {
          width: 100%;
          min-width: 0;
          overflow-x: hidden;
        }

        .app-shell {
          width: 100%;
          min-width: 0;
        }

        .main-content {
          min-width: 0;
          max-width: 100%;
          overflow-x: hidden;
        }

        .page-content,
        .section,
        .hero-grid,
        .sensor-grid,
        .bottom-grid,
        .panel {
          min-width: 0;
          max-width: 100%;
        }

        /* =====================================================
           MOBILE
           ===================================================== */

        @media (max-width: 768px) {

          body {
            min-height: 100dvh;
            overflow-x: hidden;
          }

          .app-shell {
            display: block !important;
            min-height: 100dvh;
          }

          /* Bottom navigation keeps all four existing pages
             accessible without changing React navigation. */
          .sidebar {
            position: fixed !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            top: auto !important;

            width: 100% !important;
            height: auto !important;
            min-height: 68px !important;

            padding:
              7px
              8px
              calc(7px + env(safe-area-inset-bottom))
              !important;

            display: block !important;

            border-right: none !important;
            border-top: 1px solid rgba(98, 200, 123, 0.16) !important;

            background: rgba(7, 14, 11, 0.97) !important;

            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);

            z-index: 1000 !important;
          }

          .brand,
          .sidebar-bottom {
            display: none !important;
          }

          .navigation {
            width: 100% !important;

            display: grid !important;
            grid-template-columns:
              repeat(4, minmax(0, 1fr)) !important;

            gap: 4px !important;
          }

          .nav-item {
            width: 100% !important;
            min-width: 0 !important;

            min-height: 54px !important;

            padding: 6px 3px !important;

            display: flex !important;
            flex-direction: column !important;

            align-items: center !important;
            justify-content: center !important;

            gap: 4px !important;

            border-radius: 9px !important;

            font-size: 9px !important;
            line-height: 1 !important;

            white-space: nowrap !important;
          }

          .nav-item svg {
            width: 17px !important;
            height: 17px !important;
          }

          .nav-item:focus,
          .nav-item:focus-visible {
            outline: none !important;
            box-shadow: inset 0 0 0 1px rgba(98, 200, 123, 0.75) !important;
          }

          .nav-arrow {
            display: none !important;
          }

          .main-content {
            width: 100% !important;
            min-height: 100dvh !important;

            padding-bottom: 82px !important;
          }

          .topbar {
            width: 100% !important;

            min-height: auto !important;

            padding: 16px 15px !important;

            gap: 12px !important;

            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
          }

          .page-kicker {
            font-size: 8px !important;
            letter-spacing: 0.14em !important;
          }

          .topbar h1 {
            margin-top: 4px !important;
            font-size: 24px !important;
            line-height: 1 !important;
          }

          .connection-status {
            flex-shrink: 0 !important;
            max-width: 130px !important;
            padding: 8px 9px !important;
          }

          .connection-label {
            font-size: 8px !important;
          }

          .connection-value {
            font-size: 9px !important;
          }

          .page-content {
            width: 100% !important;
            padding: 14px 12px !important;
          }

          .hero-grid,
          .bottom-grid {
            grid-template-columns: 1fr !important;
          }

          .sensor-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .sensor-card {
            min-width: 0 !important;
            padding: 12px !important;
          }

          .sensor-name {
            font-size: 10px !important;
          }

          .sensor-reading {
            font-size: 20px !important;
          }

          .section-heading {
            gap: 10px !important;
          }

          .section-heading h2 {
            font-size: 18px !important;
          }

          .panel {
            min-width: 0 !important;
            overflow: hidden !important;
          }

          /* Field page has an inline two-column grid.
             Override it only on small screens. */
          .main-content > div[style] {
            grid-template-columns: 1fr !important;
            height: auto !important;
            min-height: 0 !important;
          }

          .main-content > div[style] > div {
            min-width: 0 !important;
          }

          /* Keep the 3D field usable on phones. */
          .main-content canvas {
            max-width: 100% !important;
            touch-action: pan-y !important;
          }

          /* Recharts and other wide content should never
             push the entire page horizontally. */
          .recharts-responsive-container {
            max-width: 100% !important;
          }

          /* Tables can scroll inside themselves instead of
             widening the whole page. */
          .page-content table {
            max-width: 100% !important;
          }
        }

        @media (max-width: 430px) {

          .topbar {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .topbar h1 {
            font-size: 21px !important;
          }

          .connection-status {
            max-width: 112px !important;
          }

          .sensor-grid {
            grid-template-columns: 1fr !important;
          }

          .page-content {
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
        }

        /* =====================================================
           DESKTOP CURSOR SPARKLE
           ===================================================== */

        .smartfarm-cursor-layer {
          position: fixed;

          inset: 0;

          width: 100vw;
          height: 100vh;

          pointer-events: none;

          z-index: 99999;

          overflow: hidden;
        }

        .smartfarm-cursor-core {
          position: fixed;

          left: 0;
          top: 0;

          width: 8px;
          height: 8px;

          /* compact telemetry beacon */

          margin-left: -4px;
          margin-top: -4px;

          border-radius: 50%;

          background: #62c87b;
          border: 1px solid rgba(66, 200, 217, 0.9);

          box-shadow:
            0 0 7px rgba(98, 200, 123, 0.85),
            0 0 16px rgba(66, 200, 217, 0.35),
            0 0 24px rgba(98, 200, 123, 0.18);

          pointer-events: none;
        }

        .smartfarm-cursor-core::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 18px;
          height: 18px;
          margin-left: -9px;
          margin-top: -9px;
          border: 1px solid rgba(66, 200, 217, 0.42);
          border-radius: 50%;
          animation: smartfarm-pulse 1.35s ease-out infinite;
        }

        @keyframes smartfarm-pulse {
          0% {
            transform: scale(0.65);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.35);
            opacity: 0;
          }
        }

        .smartfarm-cursor-particle {
          position: fixed;

          width: 4px;
          height: 4px;

          margin-left: -2px;
          margin-top: -2px;

          border-radius: 50%;

          background: #62c87b;

          box-shadow:
            0 0 7px rgba(98, 200, 123, 0.9),
            0 0 12px rgba(66, 200, 217, 0.42);

          pointer-events: none;

          animation:
            smartfarm-sparkle 650ms
            cubic-bezier(0.2, 0.7, 0.2, 1)
            forwards;
        }

        .smartfarm-cursor-leaf {
          width: 7px;
          height: 4px;
          margin-left: -3px;
          margin-top: -2px;
          border-radius: 100% 0 100% 0;
          background: #62c87b;
          box-shadow:
            0 0 7px rgba(98, 200, 123, 0.85),
            0 0 12px rgba(66, 200, 217, 0.3);
          transform: rotate(35deg);
        }

        @keyframes smartfarm-sparkle {
          0% {
            opacity: 0.95;
            transform:
              translate3d(0, 0, 0)
              scale(1);
          }

          55% {
            opacity: 0.7;
          }

          100% {
            opacity: 0;
            transform:
              translate3d(var(--dx), var(--dy), 0)
              scale(0.15);
          }
        }

        /* Never show the cursor layer on touch devices. */
        @media (hover: none), (pointer: coarse) {
          .smartfarm-cursor-layer {
            display: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .smartfarm-cursor-layer {
            display: none !important;
          }
        }
      `}</style>

      <div
        ref={layerRef}
        className="smartfarm-cursor-layer"
        aria-hidden="true"
      >
        <div
          ref={cursorRef}
          className="smartfarm-cursor-core"
        />
      </div>
    </>
  );
}
