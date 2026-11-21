import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/600-italic.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { readLaunch } from "./launch";
import "./styles.css";

const launch = readLaunch();
document.documentElement.dataset.window = launch.mode;

const root = document.getElementById("root");
if (!root) throw new Error("Glint could not find its root element.");

createRoot(root).render(<App />);
