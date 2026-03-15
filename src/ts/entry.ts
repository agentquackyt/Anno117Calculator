import { App } from "./modules/App";
import { registerAqueductModifier } from "./modules/modifier/Aqueduct";

document.addEventListener("DOMContentLoaded", () => {
    registerAqueductModifier();
    const app = App.getInstance();
    app.initialize();
});