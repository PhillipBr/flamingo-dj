import {
  useEffect,
  useState,
} from "react";

export type MobileOrientation =
  | "portrait"
  | "landscape";

type MobileViewportState = {
  isMobile: boolean;
  orientation: MobileOrientation;
};

function getViewportState(): MobileViewportState {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      orientation: "portrait",
    };
  }

  return {
    isMobile: window.innerWidth <= 768,
    orientation:
      window.innerWidth > window.innerHeight
        ? "landscape"
        : "portrait",
  };
}

export function useMobileOrientation(): MobileViewportState {
  const [state, setState] =
    useState<MobileViewportState>(
      getViewportState,
    );

  useEffect(() => {
    const update = () => {
      setState(getViewportState());
    };

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    update();

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return state;
}
