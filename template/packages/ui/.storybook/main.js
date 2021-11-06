module.exports = {
  stories: [
    "../stories/**/*.stories.mdx",
    "../stories/**/*.stories.@(js|jsx|ts|tsx)",
  ],

  addons: ["@storybook/addon-links", "@storybook/addon-essentials"],

  webpackFinal: (config) => {
    const spriteCondition = { and: [/images\/svg/, /\.svg$/] };

    config.module.rules.find((r) => r.test.test("./image.svg")).exclude =
      spriteCondition;

    config.module.rules.push({
      test: spriteCondition,
      loader: "svg-sprite-loader",
    });

    return config;
  },
};
