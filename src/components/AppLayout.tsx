import { ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { useProfile } from "@/hooks/useProfile";
import logo from "@/assets/logo.png";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export const AppLayout = ({ title, subtitle, actions, children }: Props) => {
  const { logoUrl } = useProfile();

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      <AppSidebar />

      <div className="flex-1 min-w-0">
        <header className="bg-primary text-primary-foreground px-3 py-3 sm:px-6 print:bg-transparent print:text-foreground">
          <div className="flex items-center gap-3 pr-24 lg:pr-0">
            <img
              src={logoUrl || logo}
              alt="الشعار"
              className="h-10 sm:h-14 w-auto object-contain shrink-0"
            />
            <div className="min-w-0">
              <h1
                className="font-bold leading-tight"
                style={{ fontSize: "clamp(0.85rem, 3.2vw, 1.5rem)" }}
              >
                مركز إنماء الأهلي الخيري - قسم القرآن الكريم
              </h1>
              <p className="text-primary-foreground/85 text-xs sm:text-sm truncate">
                {subtitle ? `${title} — ${subtitle}` : title}
              </p>
            </div>
          </div>
          {actions && <div className="mt-3 flex flex-wrap gap-2 print:hidden">{actions}</div>}
        </header>

        <main className="p-3 sm:p-4">{children}</main>
      </div>
    </div>
  );
};

export default AppLayout;
