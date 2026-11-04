import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_GROUP_LIST_PAGE_SIZE,
  type GroupSummary,
} from "@/lib/api/groups-api";
import { useAppServices } from "@/lib/services/app-services-context";

function mergeGroupsById(
  existing: GroupSummary[],
  incoming: GroupSummary[],
): GroupSummary[] {
  if (incoming.length === 0) return existing;
  const map = new Map<string, GroupSummary>();
  for (const g of existing) map.set(g.id, g);
  for (const g of incoming) map.set(g.id, g);
  return [...map.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function useGroups() {
  const { groupsApi } = useAppServices();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await groupsApi.listMine({
        limit: DEFAULT_GROUP_LIST_PAGE_SIZE,
      });
      setGroups(page.items);
      nextCursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor != null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [groupsApi]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !nextCursorRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await groupsApi.listMine({
        limit: DEFAULT_GROUP_LIST_PAGE_SIZE,
        after: nextCursorRef.current,
      });
      setGroups((prev) => mergeGroupsById(prev, page.items));
      nextCursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor != null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [groupsApi]);

  /** Merge a live SignalR / create update into the in-memory list. */
  const upsertGroup = useCallback((group: GroupSummary) => {
    setGroups((prev) => mergeGroupsById(prev, [group]));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    groups,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    upsertGroup,
  };
}
