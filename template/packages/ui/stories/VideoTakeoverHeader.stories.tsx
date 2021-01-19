import React from "react";
import { Story, Meta } from "@storybook/react";
import VideoTakeoverHeader, {
  Props as VideoTakeoverHeaderProps,
} from "../src/layouts/VideoTakeoverHeader";
import LandscapeTransition from "../src/components/LandscapeTransition";
import LinearLogo from "../src/components/LinearLogo";
import landscapeImage from "../public/repeating-landscape.webp";
import poster from "../public/Background.00_00_00_00.Still001.webp";

export default {
  title: "Layouts / VideoTakeoverHeader",
  component: VideoTakeoverHeader,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    src:
      "https://player.vimeo.com/external/493189525.m3u8?s=b0d350d87e15e002cc3ea2556bfee0adfa75f770",
    poster,
  },
} as Meta;

const Template: Story<VideoTakeoverHeaderProps> = (args) => (
  <VideoTakeoverHeader {...args}>
    <div css={{ padding: 40 }}>
      <LinearLogo css={{ maxWidth: "70vw" }} width={400} />
    </div>
  </VideoTakeoverHeader>
);

export const Default = Template.bind({});

export const WithTransition = Template.bind({});
WithTransition.args = {
  verticalOverflow: 63,
  transition: () => <LandscapeTransition landscapeSrc={landscapeImage} />,
};
