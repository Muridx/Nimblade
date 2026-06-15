import { mountScene } from "./sceneManager.js";

export function splashScene(root) {
  root.innerHTML = `
    <div class="splash">
      <div class="splash__logo" role="img" aria-label="NIMBLADE"></div>
      <p class="splash__cta"></p>
    </div>
  `;

  const onTap = () => {
    console.log("[splash] -> lobby");
    mountScene("lobby", root);
  };

  root.addEventListener("click", onTap);
  return () => root.removeEventListener("click", onTap);
}