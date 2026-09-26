import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo.png";
import {
  GraduationCap, CalendarDays, Trophy, Sparkles, Search as SearchIcon, Users, Award,
  HeartHandshake, Receipt, ScrollText, BarChart3, Camera, Settings as SettingsIcon,
  ShieldCheck, LogOut, Menu,
} from "lucide-react";

const links = [
  { to: "/", label: "الطلاب", icon: GraduationCap },
  { to: "/teachers", label: "المعلمات", icon: Users },
  { to: "/competition", label: "المسابقة الرمضانية", icon: Trophy },
  { to: "/monthly", label: "المتابعة الشهرية", icon: CalendarDays },
  { to: "/khatimat", label: "كشف الخاتمات", icon: Sparkles },
  { to: "/search", label: "البحث الشامل", icon: SearchIcon },
  { to: "/awards", label: "الإكراميات والجوائز", icon: Award },
  { to: "/certificates", label: "الشهادات", icon: ScrollText },
  { to: "/donors", label: "الداعمون", icon: HeartHandshake },
  { to: "/expenses", label: "مصروفات الحفل", icon: Receipt },
  { to: "/statistics", label: "الإحصائيات", icon: BarChart3 },
  { to: "/media", label: "معرض الصور", icon: Camera },
  { to: "/settings", label: "الإعدادات", icon: SettingsIcon },
];

const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { pathname } = useLocation();
  const { isAdmin } = useProfile();
  const all = isAdmin ? [...links, { to: "/admin", label: "الإدارة", icon: ShieldCheck }] : links;

  return (
    <nav className="flex flex-col gap-1">
      {all.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-foreground hover:bg-accent/20"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

const SidebarBody = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { profile, logoUrl } = useProfile();
  const { signOut } = useAuth();
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex flex-col items-center gap-2 border-b border-border pb-3">
        <img src={logoUrl || logo} alt="الشعار" className="h-14 w-auto object-contain" />
        <div className="text-center text-xs font-bold leading-tight text-primary">
          {profile?.center_name || "مركز إنماء الأهلي الخيري"}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavItems onNavigate={onNavigate} />
      </div>
      <Button variant="ghost" size="sm" className="gap-2 justify-start" onClick={signOut}>
        <LogOut className="h-4 w-4" />
        تسجيل الخروج
      </Button>
    </div>
  );
};

export const AppSidebar = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* شريط جانبي ثابت على اليمين للشاشات الكبيرة */}
      <aside className="hidden lg:block w-56 shrink-0 border-l border-border bg-card print:hidden">
        <div className="sticky top-0 h-screen">
          <SidebarBody />
        </div>
      </aside>

      {/* زر القائمة على الجوال */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="lg:hidden fixed top-2 right-2 z-50 gap-1 shadow-md print:hidden"
          >
            <Menu className="h-4 w-4" />
            القائمة
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-64 p-0">
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default AppSidebar;
