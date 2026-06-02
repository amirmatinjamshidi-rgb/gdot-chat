import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ContactStatus = "Online" | "Away" | "Offline";

export type Contact = {
  id: string;
  name: string;
  status: ContactStatus;
};

type ContactsState = {
  contacts: Contact[];
  searchQuery: string;
};

type ContactsActions = {
  setSearchQuery: (query: string) => void;
  addContact: (contact: Contact) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  setContactStatus: (id: string, status: ContactStatus) => void;
  getFilteredContacts: () => Contact[];
  initializeMockData: () => void;
};

type ContactsStore = ContactsState & ContactsActions;

const MOCK_CONTACTS: Contact[] = [
  { id: "1", name: "بابات", status: "Online" },
  { id: "2", name: "Bob", status: "Away" },
  { id: "3", name: "Charlie", status: "Offline" },
  { id: "4", name: "David", status: "Online" },
];

export const useContactsStore = create<ContactsStore>()(
  persist(
    (set, get) => ({
      contacts: [],
      searchQuery: "",

      initializeMockData: () => {
        if (get().contacts.length === 0) {
          set({ contacts: MOCK_CONTACTS });
        }
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      addContact: (contact: Contact) => {
        set((state) => ({
          contacts: [contact, ...state.contacts],
        }));
      },

      updateContact: (id: string, updates: Partial<Contact>) => {
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
        }));
      },

      deleteContact: (id: string) => {
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
        }));
      },

      setContactStatus: (id: string, status: ContactStatus) => {
        get().updateContact(id, { status });
      },

      getFilteredContacts: () => {
        const { contacts, searchQuery } = get();
        const q = searchQuery.trim().toLowerCase();
        if (!q) return contacts;
        return contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.status.toLowerCase().includes(q),
        );
      },
    }),
    {
      name: "smash_contacts_v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        contacts: state.contacts,
      }),
    },
  ),
);
