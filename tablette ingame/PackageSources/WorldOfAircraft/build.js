const copyStaticFiles = require("esbuild-copy-static-files");
const globalExternals = require("@fal-works/esbuild-plugin-global-externals");
const { typecheckPlugin } = require("@jgoz/esbuild-plugin-typecheck");
const esbuild = require("esbuild");
const postcss = require("postcss");
const postCssUrl = require("postcss-url");
const postcssPrefixSelector = require("postcss-prefix-selector");
const sassPlugin = require("esbuild-sass-plugin");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: __dirname + "/.env" });

// Chemins de déploiement
const DEPLOY_PATHS = {
  packages: path.join(__dirname, "..", "..", "Packages", "world-of-aircraft-efb", "html_ui", "efb_ui", "efb_apps", "WorldOfAircraft"),
  community: path.join(process.env.LOCALAPPDATA, "Packages", "Microsoft.Limitless_8wekyb3d8bbwe", "LocalCache", "Packages", "Community2024", "world-of-aircraft-efb", "html_ui", "efb_ui", "efb_apps", "WorldOfAircraft"),
};

// Fonction de copie récursive
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Plugin de déploiement automatique
const deployPlugin = {
  name: "deploy-to-community",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.log("\n❌ Build failed, skipping deployment");
        return;
      }

      const distDir = path.join(__dirname, "dist");
      const filesToCopy = ["WorldOfAircraft.js", "WorldOfAircraft.css", "WorldOfAircraft.js.map", "WorldOfAircraft.css.map", "airports-main.json"];

      for (const [name, destPath] of Object.entries(DEPLOY_PATHS)) {
        try {
          // Vérifie si le dossier parent existe
          const parentDir = path.dirname(destPath);
          if (!fs.existsSync(parentDir)) {
            console.log(`\n⚠️  ${name}: dossier parent inexistant, skip`);
            continue;
          }

          // Crée le dossier destination si nécessaire
          fs.mkdirSync(destPath, { recursive: true });

          // Copie les fichiers principaux
          for (const file of filesToCopy) {
            const srcFile = path.join(distDir, file);
            if (fs.existsSync(srcFile)) {
              fs.copyFileSync(srcFile, path.join(destPath, file));
            }
          }

          // Copie le dossier Assets
          const assetsDir = path.join(distDir, "Assets");
          if (fs.existsSync(assetsDir)) {
            copyRecursive(assetsDir, path.join(destPath, "Assets"));
          }

          // Copie layout.json au root du package (pour enregistrer les assets auprès de MSFS)
          const layoutSrc = path.join(__dirname, "..", "..", "layout.json");
          const packageRoot = path.resolve(destPath, "..", "..", "..", "..", "..");
          const layoutDest = path.join(packageRoot, "layout.json");
          if (fs.existsSync(layoutSrc) && fs.existsSync(packageRoot)) {
            fs.copyFileSync(layoutSrc, layoutDest);
          }

          console.log(`\n✅ Deployed to ${name}`);
        } catch (err) {
          console.log(`\n⚠️  ${name}: ${err.message}`);
        }
      }
    });
  },
};

const env = {
  typechecking: process.env.TYPECHECKING === "true",
  sourcemaps: process.env.SOURCE_MAPS === "true",
  minify: process.env.MINIFY === "true",
};

// Pre-build: copy airports JSON to dist (loaded at runtime, not bundled)
const distDir = path.join(__dirname, "dist");
fs.mkdirSync(distDir, { recursive: true });
const airportsJsonSrc = path.join(__dirname, "src", "data", "airports-main.json");
const airportsJsonDest = path.join(distDir, "airports-main.json");
if (fs.existsSync(airportsJsonSrc)) {
  fs.copyFileSync(airportsJsonSrc, airportsJsonDest);
  console.log("📦 Copied airports-main.json to dist");
}

// Plugin: load icon SVGs as raw text strings (inlined in HTML, not data URLs)
// Coherent GT cannot render percent-encoded data URLs in <img> tags,
// so we embed raw SVG markup and inject it directly via innerHTML.
// Matches: icons/items/t0/*.svg, icons/items/t1/*.svg, icons/personnel/*.svg
const svgTextPlugin = {
  name: "svg-text-loader",
  setup(build) {
    build.onLoad({ filter: /icons[\\/](?:items|personnel)[\\/].*\.svg$/ }, async (args) => {
      const content = fs.readFileSync(args.path, "utf8");
      return { contents: `export default ${JSON.stringify(content)}`, loader: "js" };
    });
  },
};

const baseConfig = {
  entryPoints: ["src/WorldOfAircraft.tsx"],
  keepNames: true,
  bundle: true,
  outdir: "dist",
  sourcemap: env.sourcemaps,
  minify: env.minify,
  logLevel: "debug",
  loader: {
    ".html": "copy",
    ".png": "dataurl",
    ".svg": "dataurl",
    ".jpg": "copy",
    ".jpeg": "copy",
  },
  target: "es2017",
  define: { BASE_URL: `"coui://html_ui/efb_ui/efb_apps/WorldOfAircraft"` },
  plugins: [
    svgTextPlugin,
    copyStaticFiles({
      src: "./src/Assets",
      dest: "./dist/Assets",
    }),
    globalExternals.globalExternals({
      "@microsoft/msfs-sdk": {
        varName: "msfssdk",
        type: "cjs",
      },
      "@workingtitlesim/garminsdk": {
        varName: "garminsdk",
        type: "cjs",
      },
    }),
    sassPlugin.sassPlugin({
      async transform(source) {
        const { css } = await postcss([
          postCssUrl({
            url: "copy",
          }),
          postcssPrefixSelector({
            prefix: `.efb-view.${__dirname.split("\\").at(-1)}`,
          }),
        ]).process(source, { from: undefined });
        return css;
      },
    }),
    deployPlugin,
  ],
};

if (env.typechecking) {
  baseConfig.plugins.push(
    typecheckPlugin({ watch: process.env.SERVING_MODE === "WATCH" })
  );
}

if (process.env.SERVING_MODE === "WATCH") {
  esbuild.context(baseConfig).then((ctx) => ctx.watch());
} else if (process.env.SERVING_MODE === "SERVE") {
  esbuild
    .context(baseConfig)
    .then((ctx) => ctx.serve({ port: process.env.PORT_SERVER }));
} else if (["", undefined].includes(process.env.SERVING_MODE)) {
  esbuild.build(baseConfig);
} else {
  console.error(`MODE ${process.env.SERVING_MODE} is unknown`);
}
