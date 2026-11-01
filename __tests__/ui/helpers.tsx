import React from "react";
import { render, type RenderOptions } from "@testing-library/react-native";

import { AppServicesProvider } from "@/lib/services/app-services-context";
import type { AppServices } from "@/lib/services/app-services";

export function randomId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function mockAppServices(
  overrides: Partial<AppServices> = {},
): AppServices {
  const base = {
    authApi: {},
    authStore: {
      isLoggedIn: jest.fn(async () => false),
      clear: jest.fn(async () => undefined),
    },
    kekManager: {
      hasKek: jest.fn(async () => true),
      getLockMode: jest.fn(async () => "pin" as const),
      getPassphraseForDb: jest.fn(async () => "pass"),
      createKekAfterBiometric: jest.fn(async () => undefined),
      createKekWithPin: jest.fn(async () => undefined),
    },
    db: {
      isOpen: jest.fn(() => false),
      open: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    },
    identityStore: {},
    cryptoKeyStore: {},
    crypto: {},
    conversationStore: {
      listAll: jest.fn(async () => []),
    },
    syncService: {
      listMessageRequests: jest.fn(async () => []),
      acceptMessageRequest: jest.fn(async () => undefined),
      rejectMessageRequest: jest.fn(async () => undefined),
      retryIdentityQuarantine: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    },
    signalService: {
      getSafetyNumber: jest.fn(async () => "12345678901234567890"),
      getIdentityTrust: jest.fn(async () => ({ keyChanged: false })),
      acceptNewIdentityKey: jest.fn(async () => undefined),
    },
    appLockStore: {
      lock: jest.fn(),
    },
    mediaTransfer: {},
  } as unknown as AppServices;

  return { ...base, ...overrides } as AppServices;
}

export function renderWithServices(
  ui: React.ReactElement,
  services: AppServices = mockAppServices(),
  options?: RenderOptions,
) {
  return render(
    <AppServicesProvider value={services}>{ui}</AppServicesProvider>,
    options,
  );
}
