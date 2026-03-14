import { App } from "./modules/App";

document.addEventListener("DOMContentLoaded", () => {
    const app = App.getInstance();
    app.initialize();
});