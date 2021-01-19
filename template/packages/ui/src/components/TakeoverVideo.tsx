import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export type Props = {
  src: string;
  poster?: string;
  verticalOverflow?: number;
  children?: React.ReactNode;
};

function isHTMLVideoElement(
  obj: null | HTMLVideoElement
): obj is HTMLVideoElement {
  return typeof obj !== null;
}

function TakeoverVideo({ src, poster, verticalOverflow = 0, children }: Props) {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [playing, setPlaying] = useState<boolean>(false);
  const [time, setTime] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const durationRef = useRef<number>(0);

  useEffect(() => {
    const video = videoRef.current;

    if (!isHTMLVideoElement(video)) {
      return;
    }

    if (Hls.isSupported()) {
      var hls = new Hls();
      // hls.on(Hls.Events.LEVEL_SWITCHED, (...args) => console.log(...args));
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        video.addEventListener("loadedmetadata", () => {
          durationRef.current = video.duration;
          setLoaded(true);
          video.play();
        });
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        setLoaded(true);
        video.play();
      });
    }
  }, []);

  return (
    <div css={{ position: "relative" }}>
      <div
        css={{
          position: "absolute",
          width: "100%",
          height: `calc(100vh + ${verticalOverflow}px)`,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
      <video
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => {
          setTime(videoRef.current?.currentTime as number);
        }}
        css={{
          display: "block",
          objectFit: "cover",
          width: "100vw",
          height: `calc(100vh + ${verticalOverflow}px)`,
          "&:focus": {
            outline: "none",
          },
        }}
        muted
        loop
        poster={poster}
        ref={videoRef}
      />
    </div>
  );
}

export default TakeoverVideo;
