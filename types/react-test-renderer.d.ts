declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export type ReactTestRenderer = {
    update(nextElement: ReactElement): void;
    unmount(): void;
  };

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void> | void;
}
