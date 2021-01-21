import React from "react";
import { css } from "@styled-system/css";

export type Props = {
  children: React.ReactNode;
};

function Frame({ children }: Props) {
  return (
    <div
      css={css({
        display: "flex",
        boxSizing: "border-box",
        alignItems: "center",
        justifyContent: "center",
        height: "calc(100vh - 4em)",
        border: "1px solid",
        borderColor: "shades.2",
        margin: "2em",
      })}
    >
      {children}
    </div>
  );
}

export default Frame;
