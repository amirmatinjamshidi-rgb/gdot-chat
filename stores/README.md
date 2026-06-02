# Smash State Management Migration

## ✅ Level 1: Auth Store - COMPLETED

**Status**: Migrated from Context to Zustand ✓

**Benefits**:
- ⚡ **Performance**: Components only re-render when their specific auth data changes
- 🎯 **Simplicity**: No Provider wrapper needed in component tree
- 🔒 **Security**: Maintained existing SecureStore (native) + AsyncStorage (web) persistence
- 🧪 **DX**: Easier to test, no need to mock Context providers

**Files Created**:
- `stores/auth-store.ts` - Zustand store with persist middleware

**Files Modified**:
- `app/_layout.tsx` - Removed `<AuthProvider>`, added `AuthInitializer` component
- `app/login.tsx` - Updated to use `useAuthStore()`
- `app/verify-otp.tsx` - Updated to use `useAuthStore()`
- `app/(tabs)/profile.tsx` - Updated to use `useAuthStore()`
- `app/(tabs)/_layout.tsx` - Updated to use `useAuthStore()`

---

## ✅ Level 2: Theme Store - COMPLETED

**Status**: Migrated from Context to Zustand ✓

**Benefits**:
- ⚡ **Performance**: Selective re-renders - only components using specific theme properties re-render
- 🎨 **Computed Properties**: Theme colors, navigation theme, and legacy colors auto-computed from state
- 🌓 **System Sync**: Automatically tracks system color scheme changes
- 🎯 **Simplicity**: No Provider wrapper, direct store access

**Files Created**:
- `stores/theme-store.ts` - Zustand store with computed theme properties

**Files Modified** (21 files total)

---

## ✅ Level 3: Chats Store - COMPLETED

**Status**: Migrated from local state to Zustand ✓

**Benefits**:
- 💾 **Persistence**: Chats persist across app restarts via AsyncStorage
- 🔍 **Search**: Built-in search/filter logic in the store
- 🎯 **Operations**: Clean API for add, update, delete, markAsRead
- ⚡ **Performance**: Selective re-renders, computed filtered chats

**Files Created**:
- `stores/chats-store.ts` - Zustand store with chat management

---

## ✅ Level 4: Messages Store - COMPLETED

**Status**: Migrated from local state to Zustand ✓

**Benefits**:
- 💾 **Persistence**: Messages persist per chat across app restarts
- 🎯 **Chat Isolation**: Messages organized by `chatId`
- 🎵 **Unified Playback**: Single `activePlaybackId` for all media (voice/video)
- 📊 **CRUD API**: Full CRUD operations for messages

**Files Created**:
- `stores/messages-store.ts` - Messages with multi-chat support

**Files Modified**:
- `app/ChatRoom.tsx` - Integrated messages store

**Store API**:
- `addMessage(chatId, message)` - Add new message
- `updateMessage(chatId, messageId, updates)` - Update existing message
- `deleteMessage(chatId, messageId)` - Remove message
- `getMessagesForChat(chatId)` - Get all messages for a chat
- `setActivePlayback(messageId)` - Set active media playback
- `clearChatMessages(chatId)` - Clear all messages for a chat
- `initializeMockMessages(chatId)` - Load mock data for development

---

## ✅ Level 5: Input Store - COMPLETED

**Status**: Migrated from local state to Zustand ✓

**Benefits**:
- 💾 **Draft Persistence**: Text drafts saved per chat
- 🎛️ **Composer Mode**: Per-chat mode (send/voice/video) persisted
- 🎙️ **Recording State**: Centralized recording management
- 🎯 **Focus Management**: Track which chat is focused

**Files Created**:
- `stores/input-store.ts` - Input and composer state management

**Files Modified**:
- `app/ChatRoom.tsx` - Integrated input store for drafts and composer mode

**Store API**:
- `getDraft(chatId)` / `setDraft(chatId, text)` / `clearDraft(chatId)` - Draft management
- `getComposerMode(chatId)` / `setComposerMode(chatId, mode)` / `cycleComposerMode(chatId)` - Composer mode
- `setFocusedChat(chatId)` - Track focused chat
- `startRecording(chatId)` / `stopRecording()` / `cancelRecording()` - Recording state
- `updateRecordingTime(elapsedMs)` / `lockRecording()` - Recording controls
- `isRecording(chatId?)` - Check recording status

---

## 📊 Migration Summary

**Total Stores Created**: 5 (Auth, Theme, Chats, Messages, Input)
**Total Files Modified**: 22+
**Old Providers Deprecated**: 2 (auth-provider, theme-palette-provider)

**TypeScript**: ✅ Passes compilation
**Linting**: ✅ Clean
**No Breaking Changes**: ✅ All functionality maintained

---

## ⚡ Optimization: Selector Functions

**Issue Fixed**: "The result of getSnapshot should be cached to avoid an infinite loop"

We removed computed getters from stores and replaced them with selector functions to prevent re-render loops and improve performance.

**Before (problematic):**
```typescript
export const useThemeStore = create<ThemeStore>()(
  persist((set, get) => ({
    themeId: DEFAULT_THEME_ID,
    get colors() {
      return resolveThemeColors(get().themeId, get()._systemMode);
    },
  }))
);
```

**After (optimized):**
```typescript
// Store only contains state and actions
export const useThemeStore = create<ThemeStore>()(
  persist((set, get) => ({
    themeId: DEFAULT_THEME_ID,
    mode: "light",
  }))
);

// Selector functions compute derived values
export const selectColors = (state: ThemeStore): AppColorScheme => {
  return resolveThemeColors(state.themeId, state.mode);
};
```

**Usage with shallow comparison hooks (recommended):**
```typescript
// ✅ Best: Use pre-configured hooks with shallow comparison
import { useColors, useLegacyColors, useNavigationTheme } from "@/stores/theme-store";

const colors = useColors();
const legacyColors = useLegacyColors();
const navigationTheme = useNavigationTheme();
```

**Or use selector functions directly with useShallow:**
```typescript
// ✅ Good: Use selector with useShallow wrapper
import { useThemeStore, selectColors } from "@/stores/theme-store";
import { useShallow } from "zustand/react/shallow";

const colors = useThemeStore(useShallow(selectColors));
```

**Avoid:**
```typescript
// ❌ Don't use getters (causes infinite loops)
const colors = useThemeStore((state) => state.colors);

// ❌ Don't use selectors without shallow comparison
const colors = useThemeStore(selectColors); // Infinite re-renders!
```

**Benefits:**
- ✅ No infinite loop warnings
- ✅ Proper memoization by Zustand
- ✅ Better performance (only recomputes when dependencies change)
- ✅ Prevents unnecessary re-renders

**Files Updated**: All 21 files using `useThemeStore` now use selector functions

---

## 🎯 Next Steps

### Future Levels (6-10):
6. Contacts Store (user contacts with search/filter)
7. Settings Store (app preferences beyond theme)
8. UI/UX State (modals, bottom sheets, toast notifications)
9. Keyboard State (visibility, height tracking)
10. Network State (connection status, sync queue)
