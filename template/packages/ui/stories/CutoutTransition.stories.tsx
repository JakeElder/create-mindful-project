import React from "react";
import { Story, Meta } from "@storybook/react";
import CutoutTransition from "../src/components/CutoutTransition";
import type { Props as CutoutTransitionProps } from "../src/components/CutoutTransition";
import landscape from "../public/repeating-landscape.webp";
import image from "../public/Background.00_00_00_00.Still001.webp";

export default {
  title: "Components / CutoutTransition",
  component: CutoutTransition,
  parameters: {
    layout: "fullscreen",
  },
} as Meta;

export const Default: Story<CutoutTransitionProps> = (args) => (
  <>
    <img src={image} css={{ width: "100%" }} />
    <CutoutTransition {...args} />
  </>
);

Default.args = {
  height: 100,
  imageOffset: 120,
  overlap: 65,
  src: landscape,
};
