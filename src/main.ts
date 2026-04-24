import "./styles/main.css";
import "katex/dist/katex.min.css";
import { startApp } from "./app";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root element");
startApp(root).catch((err) => {
  console.error("Failed to start app:", err);
  root.innerHTML = `<pre class="p-4 text-red-600">${String(err)}</pre>`;
});
