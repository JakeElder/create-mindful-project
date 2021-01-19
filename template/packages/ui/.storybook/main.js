const path = require("path");

module.exports = {
  stories: [
    "../stories/**/*.stories.mdx",
    "../stories/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: ["@storybook/addon-links", "@storybook/addon-essentials"],
  babel: (config) => {
    config.presets.push(require.resolve("@emotion/babel-preset-css-prop"));
    return config;
  },
  webpackFinal: async (config) => {
    const emotionPath = path.dirname(
      require.resolve("@emotion/react/package.json")
    );
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve.alias,
          "@emotion/core": emotionPath,
          "emotion-theming": emotionPath,
        },
      },
    };
  },
};
