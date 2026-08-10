import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getViewAsUserId, setViewAsUserId } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";

const ViewAsBanner = () => {
  const viewAs = getViewAsUserId();
  const [centerName, setCenterName] = useState("");

  useEffect(() => {
    if (!viewAs) return;
    supabase.from("profiles").select("center_name").eq("user_id", viewAs).maybeSingle()
      .then(({ data }) => setCenterName(data?.center_name ?? ""));
  }, [viewAs]);

  if (!viewAs) return null;

  const exit = async () => {
    await setViewAsUserId(null);
    window.location.href = "/";
  };

  return (
    <div className="sticky top-0 z-50 bg-accent text-accent-foreground px-4 py-2 flex items-center justify-between gap-3 print:hidden" dir="rtl">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Eye className="h-4 w-4" />
        وضع العرض (قراءة فقط){centerName ? ` — ${centerName}` : ""}
      </div>
      <Button size="sm" variant="secondary" className="gap-1" onClick={exit}>
        <X className="h-3 w-3" />
        خروج من وضع العرض
      </Button>
    </div>
  );
};

export default ViewAsBanner;