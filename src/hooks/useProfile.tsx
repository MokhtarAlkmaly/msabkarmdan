import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getViewAsUserId } from "@/utils/storage";

export interface CenterProfile {
  user_id: string;
  email: string | null;
  center_name: string;
  logo_path: string | null;
  is_active: boolean;
}

export const useProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CenterProfile | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const viewAs = getViewAsUserId();

  const load = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    setLoading(true);

    const [{ data: roleRow }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      supabase
        .from("profiles")
        .select("user_id,email,center_name,logo_path,is_active")
        .eq("user_id", viewAs || user.id)
        .maybeSingle(),
    ]);

    setIsAdmin(!!roleRow);
    setProfile((prof as CenterProfile) ?? null);

    if (prof?.logo_path) {
      const { data } = await supabase.storage.from("logos").createSignedUrl(prof.logo_path, 3600);
      setLogoUrl(data?.signedUrl ?? null);
    } else {
      setLogoUrl(null);
    }
    setLoading(false);
  }, [user, viewAs]);

  useEffect(() => { load(); }, [load]);

  return { profile, logoUrl, isAdmin, loading, refresh: load, viewAsUserId: viewAs };
};