import React, { createContext, useContext } from "react";

import type { AppServices } from "./app-services";
import { appServices } from "./app-services";

const AppServicesContext = createContext<AppServices>(appServices);

export function AppServicesProvider({
  children,
  value = appServices,
}: {
  children: React.ReactNode;
  value?: AppServices;
}) {
  return (
    <AppServicesContext.Provider value={value}>
      {children}
    </AppServicesContext.Provider>
  );
}

export function useAppServices(): AppServices {
  return useContext(AppServicesContext);
}
