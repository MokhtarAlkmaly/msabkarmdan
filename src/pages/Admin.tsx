import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { setViewAsUserId } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Eye, KeyRound, Lock, Unlock, UserPlus, Building2, Trash2 } from "lucide-react";

interface Row {
  user_id: string;
  email: string | null;
  center_name: string;
  is_active: boolean;
  created_at: string;
}

const Admin = () => {
  const { user } = useAuth();
  const { isAdmin, loading: profileLoading } = useProfile();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [centerName, setCenterName] = useState("");

  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteFor, setDeleteFor] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,email,center_name,is_active,created_at")
      .order("created_at");
    if (error) toast({ title: "خطأ في تحميل المراكز", description: error.message, variant: "destructive" });
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    setBusy(false);
    if (error) {
      toast({ title: "فشل التنفيذ", description: error.message, variant: "destructive" });
      return false;
    }
    if ((data as any)?.error) {
      toast({ title: "فشل التنفيذ", description: String((data as any).error), variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    const ok = await call({ action: "create", email, password, center_name: centerName });
    if (!ok) return;
    toast({ title: "تم إنشاء المستخدم", description: `سلّم كلمة المرور المؤقتة إلى ${email}` });
    setCreateOpen(false);
    setEmail(""); setPassword(""); setCenterName("");
    load();
  };

  const handleReset = async () => {
    if (!resetFor) return;
    const ok = await call({ action: "reset_password", user_id: resetFor.user_id, password: newPassword });
    if (!ok) return;
    toast({ title: "تم تعيين كلمة مرور جديدة", description: `سلّمها إلى ${resetFor.email ?? "المستخدم"}` });
    setResetFor(null);
    setNewPassword("");
  };

  const toggleActive = async (row: Row) => {
    const ok = await call({ action: "set_active", user_id: row.user_id, is_active: !row.is_active });
    if (ok) load();
  };

  const handleDelete = async () => {
    if (!deleteFor) return;
    const ok = await call({ action: "delete", user_id: deleteFor.user_id });
    if (!ok) return;
    toast({ title: "تم حذف الحساب", description: deleteFor.email ?? deleteFor.center_name });
    setDeleteFor(null);
    load();
  };

  const viewAs = async (row: Row) => {
    await setViewAsUserId(row.user_id);
    navigate("/");
  };

  if (profileLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جارٍ التحميل...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
        <h1 className="text-xl font-bold">هذه الصفحة للمسؤول العام فقط</h1>
        <Link to="/"><Button variant="outline">العودة للرئيسية</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-primary text-primary-foreground py-4 px-4">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            إدارة المراكز والمستخدمين
          </h1>
          <Link to="/">
            <Button variant="secondary" size="sm" className="gap-1">
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto p-4 space-y-4">
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            كل مركز يدير بياناته واسمه وشعاره بنفسه. يمكنك الاطلاع على بيانات أي مركز عبر «عرض كمركز» دون تعديلها.
          </p>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            إضافة مستخدم / مركز
          </Button>
        </Card>

        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-right">م</th>
                <th className="p-3 text-right">المركز</th>
                <th className="p-3 text-right">البريد الإلكتروني</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">جارٍ التحميل...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد مراكز</td></tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.user_id} className="border-t border-border">
                  <td className="p-3">{i + 1}</td>
                  <td className="p-3 font-semibold">
                    {row.center_name}
                    {row.user_id === user?.id && <Badge variant="secondary" className="ms-2">أنت</Badge>}
                  </td>
                  <td className="p-3" dir="ltr">{row.email ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant={row.is_active ? "default" : "destructive"}>
                      {row.is_active ? "نشط" : "موقوف"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => viewAs(row)}>
                        <Eye className="h-3 w-3" />
                        عرض كمركز
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => setResetFor(row)}>
                        <KeyRound className="h-3 w-3" />
                        كلمة مرور جديدة
                      </Button>
                      {row.user_id !== user?.id && (
                        <Button size="sm" variant="ghost" className="gap-1" disabled={busy} onClick={() => toggleActive(row)}>
                          {row.is_active ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          {row.is_active ? "إيقاف" : "تنشيط"}
                        </Button>
                      )}
                      {row.user_id !== user?.id && (
                        <Button size="sm" variant="destructive" className="gap-1" disabled={busy} onClick={() => setDeleteFor(row)}>
                          <Trash2 className="h-3 w-3" />
                          حذف
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
            <DialogDescription>
              كلمات المرور تُخزَّن مشفّرة ولا يمكن عرضها لاحقًا، لذلك حدّد كلمة مرور مؤقتة وسلّمها لصاحب المركز.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>اسم المركز</Label>
              <Input value={centerName} onChange={(e) => setCenterName(e.target.value)} placeholder="مركز ... الخيري" />
            </div>
            <div className="space-y-1">
              <Label>البريد الإلكتروني</Label>
              <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور المؤقتة</Label>
              <Input dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={busy}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>كلمة مرور جديدة — {resetFor?.center_name}</DialogTitle>
            <DialogDescription>ستظهر لك هنا فقط الآن؛ سلّمها لصاحب المركز.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>كلمة المرور الجديدة</Label>
            <Input dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
          </div>
          <DialogFooter>
            <Button onClick={handleReset} disabled={busy}>تعيين</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;