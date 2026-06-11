/**
  * NIMBLADE -- splash scene
  * Full bg + logo + tap to start.
 */
export function splashScene(root) {
  root.innerHTML = `
    <div class="splash">
      <div class="splash__logo" role="img" aria-label="NIMBLADE"></div>
      <p class="splash__cta">TAP TO START</p>
    </div>
  `;

  const onTap = () => {
    console.log("[splash] tap to start");
    // Step 2.4 -- mount lobby scene di sini
  };

  root.addEventListener("click", onTap);

  return () => {
    root.removeEventListener("click", onTap);
  };
}