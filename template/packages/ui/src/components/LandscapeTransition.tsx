import React from "react";
import CutoutTransition from "./CutoutTransition";

export type Props = { landscapeSrc: string };

function LandscapeTransition({ landscapeSrc }: Props) {
  return (
    <CutoutTransition
      src={landscapeSrc}
      height={100}
      overlap={65}
      imageOffset={-80}
    />
  );
}

export default LandscapeTransition;
