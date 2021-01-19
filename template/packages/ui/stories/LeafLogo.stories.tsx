import React from "react";
import { Story, Meta } from "@storybook/react";
import LeafLogo from "../src/components/LeafLogo";
import type { Props as LeafLogoProps } from "../src/components/LeafLogo";

export default {
  title: "Components / LeafLogo",
  component: LeafLogo,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
    },
  },
} as Meta;

export const Default: Story<LeafLogoProps> = (args) => <LeafLogo {...args} />;
