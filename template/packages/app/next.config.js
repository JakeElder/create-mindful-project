const path = require("path");
const withPlugins = require("next-compose-plugins");
const transpileModules = require("next-transpile-modules");
const bundleAnalyzer = require("@next/bundle-analyzer");

const plugins = [
  transpileModules([
    "@mindfulstudio/{{projectHid}}-ui",
    "@mindfulstudio/{{projectHid}}-types",
  ]),
  bundleAnalyzer({
    enabled: process.env.ANALYZE === "true",
  }),
];

module.exports = withPlugins(plugins, {
  webpack: (config, { isServer }) => {
    const spriteCondition = { and: [/images\/svg/, /\.svg$/] };

    config.module.rules.find((r) => r.loader === "next-image-loader").exclude =
      spriteCondition;

    config.module.rules.push({
      test: spriteCondition,
      loader: "svg-sprite-loader",
    });

    if (!isServer && process.env.NODE_ENV === "production") {
      config.externals = {
        ...config.externals,
        react: "React",
        "react-dom": "ReactDOM",
      };
    }

    return config;
  },
  env: {
    GRAPHQL_URL: process.env.GRAPHQL_URL,
    POLL_INTERVAL: ["stage"].includes(process.env.NODE_ENV) ? 1000 : 0,
  },
  i18n: {
    locales: ["en", "th"],
    defaultLocale: "en",
  },
});
