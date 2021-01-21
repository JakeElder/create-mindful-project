const withTranspiledModules = require("next-transpile-modules")([
  "@mindfulstudio/{{projectHid}}-ui",
]);

module.exports = withTranspiledModules({
  webpack: (config) => {
    config.module.rules = [
      ...config.module.rules,
      {
        test: /\.tsx$/,
        include: /{{projectHid}}-ui/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              "@emotion/babel-preset-css-prop",
              "@babel/preset-typescript",
            ],
          },
        },
      },
    ];
    return config;
  },
  env: {
    GRAPHQL_URL: process.env.GRAPHQL_URL,
    ASSET_URL: process.env.ASSET_URL,
    POLL_INTERVAL: ["stage"].includes(process.env.NODE_ENV) ? 1000 : 0,
  },
});
