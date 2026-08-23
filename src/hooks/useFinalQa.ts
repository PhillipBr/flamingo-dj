import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  QaCheckItem,
  QaStatus,
} from "../types/finalQa";

import {
  calculateQaProgress,
  loadFinalQaItems,
  resetFinalQaItems,
  saveFinalQaItems,
} from "../utils/finalQaStorage";

export function useFinalQa() {
  const [
    items,
    setItems,
  ] = useState<QaCheckItem[]>(
    loadFinalQaItems,
  );

  useEffect(() => {
    saveFinalQaItems(items);
  }, [items]);

  const progress = useMemo(
    () => calculateQaProgress(items),
    [items],
  );

  function setStatus(
    id: string,
    status: QaStatus,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status }
          : item,
      ),
    );
  }

  function setNotes(
    id: string,
    notes: string,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, notes }
          : item,
      ),
    );
  }

  function reset() {
    setItems(resetFinalQaItems());
  }

  return {
    items,
    progress,
    setStatus,
    setNotes,
    reset,
  };
}
