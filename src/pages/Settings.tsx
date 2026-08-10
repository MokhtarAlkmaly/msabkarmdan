import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { isViewingOtherCenter } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Save, Upload } from "lucide-react";
import defaultLogo from "@/assets/logo.png";

const Settings = () => {
  const { user } = useAuth();
  const { profile, logoUrl, loading, refresh } = useProfile();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const readOnly = isViewingOtherCenter();

  useEffect(() => { setName(profile?.center_name ?? ""); }, [profile?.center_name]);

  const saveName = async () => {
    if (!user || readOnly) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ center_name: name.trim() }).eq("user_id", user.id);
    setSaving(false);
    if (error) return toast({ title: "خطأ", description: error.message, variant: "destructive" });
    toast({ title: "تم حفظ اسم المركز" });
    refresh();
  };

  const uploadLogo = async (file: File) => {
    if (!user || readOnly) return;
    if (!file.type.startsWith("image/")) {
      return toast({ title: "الملف يجب أن يكون صورة", variant: "destructive" });
    }
    if (file.size > 3 * 1024 * 1024) {
      return toast({ title: "حجم الصورة كبير", description: "الحد الأقصى 3 ميجابايت", variant: "destructive" });
    }
    setSaving(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user.id}/logo.${ext}`;
    const { error: upErr } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (upErr) { setSaving(false); return toast({ title: "فشل رفع الشعار", description: upErr.message, variant: "destructive" }); }
    const { error } = await supabase.from("profiles").update({ logo_path: path }).eq("user_id", user.id);
    setSaving(false);
    if (error) return toast({ title: "خطأ", description: error.message, variant: "destructive" });
    toast({ title: "تم تحديث الشعار" });
    refresh();
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-primary text-primary-foreground py-4 px-4">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">إعدادات المركز</h1>
          <Link to="/">
            <Button variant="secondary" size="sm" className="gap-1">
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto p-4 max-w-xl space-y-4">
        {readOnly && (
          <Card className="p-4 text-sm text-muted-foreground">
            أنت في وضع «عرض كمركز» — لا يمكن التعديل. اخرج من وضع العرض أولًا.
          </Card>
        )}

        <Card className="p-4 space-y-4">
          <div className="flex flex-col items-center gap-3">
            <img src={logoUrl || defaultLogo} alt="شعار المركز" className="h-24 w-auto" />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
            />
            <Button variant="outline" className="gap-2" disabled={saving || readOnly} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              تغيير الشعار
            </Button>
          </div>

          <div className="space-y-1">
            <Label>اسم المركز</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading || readOnly} maxLength={120} />
          </div>

          <Button className="gap-2 w-full" onClick={saveName} disabled={saving || loading || readOnly || !name.trim()}>
            <Save className="h-4 w-4" />
            حفظ
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default Settings;