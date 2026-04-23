/* @refresh reload */
import { render } from "solid-js/web";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./index.css"; // Seus imports de CSS/Tailwind
import App from "./App";
import { AppProvider } from "./context/AppContext";

const root = document.getElementById("root");

render(
  () => (
    <AppProvider>
      <App />
    </AppProvider>
  ),
  root as HTMLElement
);