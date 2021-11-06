/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

export type Props = {
  children: React.ReactNode;
};

function Frame({ children }: Props) {
  return (
    <div
      css={css`
        display: flex;
        box-sizing: border-box;
        align-items: center;
        justify-content: center;
        height: calc(100vh - 4em);
        border: 1px solid;
        border-color: #222;
        margin: 2em;
      `}
    >
      {children}
    </div>
  );
}

export default Frame;
