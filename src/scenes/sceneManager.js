import { splashScene } from "./splash.js";
import { lobbyScene } from "./lobby.js";
import { weaponSelectScene } from "./weaponSelect.js";
import { battleScene } from "./battle.js";
import { campfireScene } from "./campfire.js";
import { shopScene } from "./shop.js";
import { treasureScene } from "./treasure.js";
import { mapScene } from "./map.js";
import { mysteryScene } from "./mystery.js";
import { crystalShrineScene } from "./crystalShrine.js";
import { bloodAltarScene } from "./bloodAltar.js";
import { gauntletScene } from "./gauntlet.js";

const scenes = {
  splash: splashScene,
  lobby: lobbyScene,
  weaponSelect: weaponSelectScene,
  battle: battleScene,
  campfire: campfireScene,
  shop: shopScene,
  treasure: treasureScene,
  map: mapScene,
  mystery: mysteryScene,
  crystal_shrine: crystalShrineScene,
  blood_altar: bloodAltarScene,
  gauntlet: gauntletScene,
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
