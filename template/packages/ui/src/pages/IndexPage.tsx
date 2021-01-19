import React from "react";
import VideoTakeoverHeader from "../layouts/VideoTakeoverHeader";
import LinearLogo from "../components/LinearLogo";
import LeafLogo from "../components/LeafLogo";

export type Props = {
  videoSrc: string;
  poster: string;
  transition: React.FunctionComponent<{}>;
};

function IndexPage({ videoSrc, poster, transition: Transition }: Props) {
  return (
    <div css={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <VideoTakeoverHeader
        verticalOverflow={-60}
        src={videoSrc}
        poster={poster}
      >
        <div css={{ padding: 40 }}>
          <LinearLogo css={{ maxWidth: "70vw" }} width={400} />
        </div>
      </VideoTakeoverHeader>
      <Transition />
      <div css={{ backgroundColor: "#222", flex: 1, overflow: "hidden" }}>
        <div css={{ height: 400, position: "relative", color: "#fff" }}>
          <LeafLogo
            css={{
              position: "absolute",
              bottom: -36,
              right: -40,
              opacity: 0.1,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default IndexPage;
