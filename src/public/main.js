import { createApp } from "vue";
import PublicApp from "../components/public/PublicApp.vue";
import "../shared/audit-shell.js";
import "../shared/connection-pill.js";
import "../shared/draw-reveal.js";
import "../shared/environment-switcher.js";
import "../shared/public-event-header.js";
import "../shared/public-live-banner.js";
import "../shared/public-stats.js";
import "../shared/public-tables.js";
import "../shared/roster-shell.js";
import "../shared/select-options.js";
import "../shared/text-content.js";
import "../shared/toasts.js";

createApp(PublicApp).mount("#rooc-vue-public-root");
