import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  ProductionDiagnosticsReport,
  StorageMigrationResult,
} from "../types/productionDiagnostics";

import {
  buildProductionDiagnostics,
} from "../utils/productionDiagnostics";

import {
  runStorageMigrations,
} from "../utils/storageMigration";

import {
  clearRecoveryCheckpoint,
  loadRecoveryCheckpoint,
  restoreRecoveryCheckpoint,
} from "../utils/recoveryService";

export function useProductionDiagnostics() {
  const [
    report,
    setReport,
  ] =
    useState<ProductionDiagnosticsReport | null>(
      null,
    );

  const [
    migration,
    setMigration,
  ] =
    useState<StorageMigrationResult | null>(
      null,
    );

  const refresh =
    useCallback(
      () => {
        setReport(
          buildProductionDiagnostics(),
        );
      },
      [],
    );

  useEffect(() => {
    const result =
      runStorageMigrations();

    setMigration(
      result,
    );

    setReport(
      buildProductionDiagnostics(),
    );
  }, []);

  const recovery =
    loadRecoveryCheckpoint();

  return {
    report,
    migration,
    recovery,
    refresh,

    restoreRecovery: () => {
      const restored =
        restoreRecoveryCheckpoint();

      if (restored) {
        window.location.reload();
      }

      return restored;
    },

    clearRecovery: () => {
      clearRecoveryCheckpoint();
      refresh();
    },
  };
}
