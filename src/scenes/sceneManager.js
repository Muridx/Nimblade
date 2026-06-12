import { splashScene } from "./splash.js";
import { lobbyScene } from "./lobby.js";
import { weaponSelectScene } from "./weaponSelect.js";
import { battleScene } from "./battle.js";
import { campfireScene } from "./campfire.js";
import { shopScene } from "./shop.js";
import { treasureScene } from "./treasure.js";
import { mapScene } from "./map.js";

const scenes = {
  splash: splashScene,
  lobby: lobbyScene,
  weaponSelect: weaponSelectScene,
  battle: battleScene,
  campfire: campfireScene,
  shop: shopScene,
  treasure: treasureScene,
  map: mapScene,
};

let currentUnmount = null;

export function mountScene(name, root, opts) {
  if (currentUnmount) currentUnmount();
  const scene = scenes[name];
  if (!scene) throw new Error(`Scene "${name}" not found`);
  root.innerHTML = "";
  currentUnmount = scene(root, opts);
  console.log(`[scene] mounted: ${name}`);
}
