import React from "react";

export type Props = {
  src: string;
  height: number;
  overlap: number;
  imageOffset?: number;
};

function CutoutTransition({ src, height, imageOffset = 0, overlap }: Props) {
  return (
    <div
      css={{
        height,
        position: "relative",
        marginTop: `-${overlap}px`,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "repeat-x",
        backgroundSize: `auto ${height}px`,
        backgroundPosition: `${imageOffset}px 0`,
      }}
    ></div>
  );
}

export default CutoutTransition;
