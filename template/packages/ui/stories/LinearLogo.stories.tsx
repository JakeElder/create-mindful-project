import React from "react";
import { Story, Meta } from "@storybook/react";
import LinearLogo, {
  Props as LinearLogoProps,
} from "../src/components/LinearLogo";

export default {
  title: "Components / Linear Logo",
  component: LinearLogo,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
    },
  },
} as Meta;

export const Default: Story<LinearLogoProps> = (args) => (
  <LinearLogo {...args} />
);
Default.args = { width: 400 };
