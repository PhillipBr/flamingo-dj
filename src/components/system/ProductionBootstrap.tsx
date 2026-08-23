import {
  useEffect,
  type ReactNode,
} from "react";

import {
  runStorageMigrations,
} from "../../utils/storageMigration";

type ProductionBootstrapProps = {
  children:
    ReactNode;
};

export default function ProductionBootstrap({
  children,
}: ProductionBootstrapProps) {
  useEffect(() => {
    runStorageMigrations();
  }, []);

  return children;
}
