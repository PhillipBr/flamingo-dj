import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  CurrentSet,
} from "../types/setlist";

import {
  loadCurrentSet,
  saveCurrentSet,
} from "../utils/currentSetStorage";

export function useStoredCurrentSet(): [
  CurrentSet,
  Dispatch<
    SetStateAction<CurrentSet>
  >,
] {
  const [
    currentSet,
    setCurrentSet,
  ] =
    useState<CurrentSet>(
      loadCurrentSet,
    );

  useEffect(() => {
    saveCurrentSet(
      currentSet,
    );
  }, [currentSet]);

  return [
    currentSet,
    setCurrentSet,
  ];
}
