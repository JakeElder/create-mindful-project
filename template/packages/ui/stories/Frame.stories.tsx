import React from "react";
import { Story, Meta } from "@storybook/react";
import Frame, { Props as FrameProps } from "../src/layouts/Frame";
import ProjectTitle from "../src/components/ProjectTitle";

export default {
  title: "Layouts / Frame",
  component: Frame,
  parameters: {
    layout: "fullscreen",
  },
} as Meta;

const Template: Story<FrameProps> = (args) => (
  <Frame {...args}>
    <ProjectTitle projectName="{{projectName}}" />
  </Frame>
);

export const Default = Template.bind({});
Default.args = {};
