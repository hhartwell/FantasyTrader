import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Admin } from "./components/Admin";

const isAdmin = (window.location.pathname.replace(/\/+$/, "") || "/") === "/admin";
if (isAdmin) {
  const about = document.getElementById("about");
  if (about) about.hidden = true;
}

createRoot(document.getElementById("root")!).render(<StrictMode>{isAdmin ? <Admin /> : <App />}</StrictMode>);
