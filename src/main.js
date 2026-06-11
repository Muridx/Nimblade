/**
  * NIMBLADE — entry point
  * v1.1 — Step 2.3: scene framework + splash
 */
import "./styles/global.css";
import { mountScene } from "./scenes/sceneManager.js";

const app = document.getElementById("app");
mountScene("splash", app);

console.log("[NIMBLADE] booted");