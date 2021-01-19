import React from "react";
import { Story, Meta } from "@storybook/react";
import IndexPage, { Props as IndexPageProps } from "../src/pages/IndexPage";
import LandscapeTransition from "../src/components/LandscapeTransition";
import landscapeImage from "../public/repeating-landscape.webp";
import poster from "../public/Background.00_00_00_00.Still001.webp";

export default {
  title: "Pages / IndexPage",
  component: IndexPage,
  parameters: {
    layout: "fullscreen",
  },
} as Meta;

export const Default: Story<IndexPageProps> = (args) => <IndexPage {...args} />;
Default.args = {
  videoSrc:
    "https://player.vimeo.com/external/493189525.m3u8?s=b0d350d87e15e002cc3ea2556bfee0adfa75f770",
  poster,
  transition: () => <LandscapeTransition landscapeSrc={landscapeImage} />,
};
