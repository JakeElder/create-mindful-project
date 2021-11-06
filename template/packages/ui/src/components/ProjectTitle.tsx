/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

export type Props = {
  projectName: string;
};

function ProjectTitle({ projectName }: Props) {
  return (
    <div
      css={css`
        color: red;
      `}
    >
      {projectName}
    </div>
  );
}

export default ProjectTitle;
