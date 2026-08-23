export type QaStatus = "pending" | "passed" | "failed" | "skipped";

export type QaCategory =
  | "core-flow"
  | "persistence"
  | "ui"
  | "responsive"
  | "performance"
  | "production"
  | "real-world";

export type QaCheckItem = {
  id: string;
  category: QaCategory;
  title: string;
  description: string;
  status: QaStatus;
  notes: string;
};

export type QaProgress = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  completionPercentage: number;
  passPercentage: number;
};
