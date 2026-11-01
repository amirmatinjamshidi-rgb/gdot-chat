export const Platform = {
  OS: "ios",
  select: <T>(spec: { ios?: T; android?: T; web?: T; default?: T; native?: T }) =>
    spec.ios ?? spec.native ?? spec.default,
};

type AppStateStatus = "active" | "background" | "inactive" | "unknown" | "extension";

export const AppState = {
  currentState: "active" as AppStateStatus,
  addEventListener: (
    _type: "change",
    _listener: (state: AppStateStatus) => void,
  ) => ({ remove: () => {} }),
};
