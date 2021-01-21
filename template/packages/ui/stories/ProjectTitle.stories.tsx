import React from "react";
import { Story, Meta } from "@storybook/react";
import ProjectTitle, {
  Props as ProjectTitleProps,
} from "../src/components/ProjectTitle";

export default {
  title: "Components / ProjectTitle",
  component: ProjectTitle,
  parameters: {
    layout: "centered",
  },
} as Meta;

export const Default: Story<ProjectTitleProps> = (args) => (
  <ProjectTitle {...args} />
);
Default.args = {
  projectName: "Mindful Studio",
};
