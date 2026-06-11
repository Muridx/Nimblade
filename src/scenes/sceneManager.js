import { splashScene } from "./splash.js";
import { lobbyScene } from "./lobby.js";

const scenes = {
  splash: splashScene,
  lobby: lobbyScene,
};

let currentUnmount = null;

export function mountScene(name, root) {
  if (currentUnmount) currentUnmount();
  const scene = scenes[name];
  if (!scene) throw new Error(`Scene "${name}" not found`);
  root.innerHTML = "";
  currentUnmount = scene(root);
  console.log(`[scene] mounted: ${name}`);
}