import { createApp } from "vue";
import LegacyBridge from "../components/LegacyBridge.vue";

createApp(LegacyBridge, {
  page: "admin"
}).mount("#rooc-vue-admin-root");
