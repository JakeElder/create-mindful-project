import React from "react";
import TakeoverVideo, {
  Props as TakeoverVideoProps,
} from "../components/TakeoverVideo";

export type Props = TakeoverVideoProps & {
  transition?: React.FunctionComponent<{}>;
};

function VideoTakeoverHeader({
  src,
  poster,
  verticalOverflow,
  transition: Transition = () => null,
  children,
}: Props) {
  return (
    <>
      <TakeoverVideo
        src={src}
        poster={poster}
        verticalOverflow={verticalOverflow}
      >
        {children}
      </TakeoverVideo>
      <Transition />
    </>
  );
}

export default VideoTakeoverHeader;
