import React from "react";
import { Story, Meta } from "@storybook/react";
import IndexPage, { Props as IndexPageProps } from "../src/pages/IndexPage";

export default {
  title: "Pages / IndexPage",
  component: IndexPage,
  parameters: {
    layout: "fullscreen",
  },
} as Meta;

export const Default: Story<IndexPageProps> = (args) => <IndexPage {...args} />;
Default.args = {
  projectName: "{{projectName}}",
};
