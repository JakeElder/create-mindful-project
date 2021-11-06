/** @jsxImportSource @emotion/react */
import theme from "../theme";
import { ThemeProvider, Global, css } from "@emotion/react";

function Theme({ children }: { children: React.ReactNode }) {
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
