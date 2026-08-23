import type {
  QaCheckItem,
  QaProgress,
} from "../types/finalQa";

import {
  FINAL_QA_TEMPLATE,
} from "./finalQaTemplate";

export const FINAL_QA_STORAGE_KEY =
  "flamingo-dj-final-qa-v1";

export function loadFinalQaItems(): QaCheckItem[] {
  try {
    const raw = localStorage.getItem(
      FINAL_QA_STORAGE_KEY,
    );

    if (!raw) {
      return FINAL_QA_TEMPLATE.map(
        (item) => ({ ...item }),
      );
    }

    const parsed = JSON.parse(raw) as QaCheckItem[];

    const savedById = new Map(
      parsed.map((item) => [
        item.id,
        item,
      ]),
    );

    return FINAL_QA_TEMPLATE.map(
      (item) => ({
        ...item,
        ...savedById.get(item.id),
      }),
    );
  } catch {
    return FINAL_QA_TEMPLATE.map(
      (item) => ({ ...item }),
    );
  }
}

export function saveFinalQaItems(
  items: readonly QaCheckItem[],
): void {
  localStorage.setItem(
    FINAL_QA_STORAGE_KEY,
    JSON.stringify(items),
  );
}

export function resetFinalQaItems(): QaCheckItem[] {
  const items = FINAL_QA_TEMPLATE.map(
    (item) => ({ ...item }),
  );

  saveFinalQaItems(items);

  return items;
}

export function calculateQaProgress(
  items: readonly QaCheckItem[],
): QaProgress {
  const total = items.length;
  const passed = items.filter((item) => item.status === "passed").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const pending = items.filter((item) => item.status === "pending").length;
  const completed = total - pending;

  return {
    total,
    passed,
    failed,
    skipped,
    pending,
    completionPercentage:
      total === 0
        ? 100
        : Math.round((completed / total) * 100),
    passPercentage:
      total === 0
        ? 100
        : Math.round((passed / total) * 100),
  };
}
