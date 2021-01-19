import React from "react";
import { Story, Meta } from "@storybook/react";
import TakeoverVideo, {
  Props as TakeoverVideoProps,
} from "../src/components/TakeoverVideo";
import LinearLogo from "../src/components/LinearLogo";
import poster from "../public/Background.00_00_00_00.Still001.webp";

export default {
  title: "Components / Takeover Video",
  component: TakeoverVideo,
  parameters: { layout: "fullscreen" },
  args: {
    src:
      "https://player.vimeo.com/external/493189525.m3u8?s=b0d350d87e15e002cc3ea2556bfee0adfa75f770",
    poster,
  },
} as Meta;

export const Default: Story<TakeoverVideoProps> = (args) => (
  <TakeoverVideo {...args} />
);

export const WithContentBeneath: Story<TakeoverVideoProps> = (args) => (
  <>
    <TakeoverVideo {...args} />
    <div css={{ height: 100, backgroundColor: "skyblue" }}></div>
  </>
);
WithContentBeneath.args = {
  verticalOverflow: 100,
};

export const WithContentOverlayed: Story<TakeoverVideoProps> = (args) => (
  <TakeoverVideo {...args}>
    <div css={{ padding: 40 }}>
      <LinearLogo width={400} css={{ marginBottom: 40 }} />
      <div css={{ height: "100vh", width: 3, background: "skyblue" }}></div>
    </div>
  </TakeoverVideo>
);
