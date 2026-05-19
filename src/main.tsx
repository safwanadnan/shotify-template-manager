import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "@gadgetinc/react";
import { api } from "./api";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider api={api as never}>
      <App />
    </Provider>
  </React.StrictMode>,
);