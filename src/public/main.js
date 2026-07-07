import { createApp } from "vue";
import LegacyBridge from "../components/LegacyBridge.vue";

createApp(LegacyBridge, {
  page: "public"
}).mount("#rooc-vue-public-root");
