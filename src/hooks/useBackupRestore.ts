import {
  useCallback,
  useState,
} from "react";

import type {
  BackupValidationResult,
} from "../types/flamingoBackup";

import {
  downloadFlamingoBackup,
  readBackupFile,
  restoreFlamingoBackup,
} from "../utils/flamingoBackupService";

export function useBackupRestore() {
  const [
    validation,
    setValidation,
  ] = useState<BackupValidationResult | null>(
    null,
  );

  const [
    selectedFileName,
    setSelectedFileName,
  ] = useState<string | null>(
    null,
  );

  const [
    busy,
    setBusy,
  ] = useState(false);

  const exportBackup = useCallback(() => {
    downloadFlamingoBackup();
  }, []);

  const inspectBackup = useCallback(
    async (file: File) => {
      setBusy(true);
      setSelectedFileName(file.name);

      try {
        const result = await readBackupFile(file);
        setValidation(result);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const restore = useCallback(() => {
    if (
      !validation?.valid ||
      !validation.backup
    ) {
      return null;
    }

    return restoreFlamingoBackup(
      validation.backup,
    );
  }, [validation]);

  const clearSelection = useCallback(() => {
    setValidation(null);
    setSelectedFileName(null);
  }, []);

  return {
    busy,
    validation,
    selectedFileName,
    exportBackup,
    inspectBackup,
    restore,
    clearSelection,
  };
}
