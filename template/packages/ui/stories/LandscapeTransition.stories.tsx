import React from "react";
import { Story, Meta } from "@storybook/react";
import LandscapeTransition from "../src/components/LandscapeTransition";
import type { Props as LandscapeTransitionProps } from "../src/components/LandscapeTransition";
import landscape from "../public/repeating-landscape.webp";
import image from "../public/Background.00_00_00_00.Still001.webp";

export default {
  title: "Components / LandscapeTransition",
  component: LandscapeTransition,
  parameters: {
    layout: "fullscreen",
  },
} as Meta;

export const Default: Story<LandscapeTransitionProps> = (args) => (
  <>
    <img src={image} css={{ width: "100%" }} />
    <LandscapeTransition {...args} />
  </>
);

Default.args = {
  landscapeSrc: landscape,
};
