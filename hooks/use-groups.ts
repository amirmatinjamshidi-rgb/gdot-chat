import { useCallback, useEffect, useState } from "react";

import type { GroupSummary } from "@/lib/api/groups-api";
import { useAppServices } from "@/lib/services/app-services-context";

export function useGroups() {
  const { groupsApi } = useAppServices();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await groupsApi.listMine();
      setGroups(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [groupsApi]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { groups, loading, error, refresh };
}
