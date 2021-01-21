import React from "react";
import { css } from "@styled-system/css";

export type Props = {
  projectName: string;
};

function ProjectTitle({ projectName }: Props) {
  return <div css={css({ color: "shades.0" })}>{projectName}</div>;
}

export default ProjectTitle;
