import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.argv[2] || "dist/config.js");
const url = process.env.SUPABASE_URL || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";
const testUrl = process.env.SUPABASE_TEST_URL || "";
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY || "";
const testLabel = process.env.SUPABASE_TEST_LABEL || "測試資料庫 rooc_test";

if ((testUrl && !testAnonKey) || (!testUrl && testAnonKey)) {
  throw new Error("SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY must be set together.");
}

if (!url || !anonKey) {
  console.log("SUPABASE_URL and SUPABASE_ANON_KEY are not both set; keeping bundled config.js.");
  process.exit(0);
}

const config = {
  defaultEnvironment: "production",
  environments: {
    production: {
      label: "正式資料庫",
      url,
      anonKey
    }
  }
};

if (testUrl && testAnonKey) {
  config.environments.rooc_test = {
    label: testLabel,
    url: testUrl,
    anonKey: testAnonKey
  };
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `window.ROOC_SUPABASE_CONFIG = ${JSON.stringify(config, null, 2)};\n`
);
console.log(`Wrote ${outputPath}`);
