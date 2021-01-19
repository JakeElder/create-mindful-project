import React from "react";
import theme from "../theme";
import { ThemeProvider, Global, css } from "@emotion/react";

function Theme({ children }: React.PropsWithChildren<{}>) {
  return (
    <ThemeProvider theme={theme}>
      <Global
        styles={css`
          svg,
          img {
            vertical-align: top;
          }
        `}
      />
      {children}
    </ThemeProvider>
  );
}

export default Theme;
