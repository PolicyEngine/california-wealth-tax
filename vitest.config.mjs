import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const config = {
  // The app writes JSX in .js files, which Next allows and oxc does not by default.
  oxc: {
    lang: "jsx",
    jsx: { runtime: "automatic" },
    include: /\.[jt]sx?$/,
    exclude: [/node_modules/],
  },
  resolve: {
    alias: [{ find: /^@\//, replacement: `${root}/` }],
  },
};

export default config;
