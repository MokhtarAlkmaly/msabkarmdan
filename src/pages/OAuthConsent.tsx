import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AuthOAuth = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

function oauth(): AuthOAuth {
  return (supabase.auth as unknown as { oauth: AuthOAuth }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("رابط غير صالح: authorization_id مفقود");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("لم يُرجع خادم التفويض أي وجهة تحويل.");
    }
    window.location.href = target;
  }

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="p-6 max-w-md">تعذّر تحميل طلب التفويض: {error}</Card>
      </div>
    );
  if (!details)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground" dir="rtl">
        جارٍ التحميل…
      </div>
    );

  const clientName = details.client?.name ?? "التطبيق";

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-primary">ربط {clientName} بحسابك</h1>
          <p className="text-muted-foreground text-sm">
            سيُتيح ذلك لـ {clientName} استخدام أدوات هذا التطبيق نيابةً عنك (قراءة بيانات الطالبات والمعلمات والإكراميات).
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => decide(true)} disabled={busy}>
            {busy ? "جارٍ..." : "الموافقة"}
          </Button>
          <Button variant="outline" onClick={() => decide(false)} disabled={busy}>
            رفض
          </Button>
        </div>
      </Card>
    </div>
  );
}