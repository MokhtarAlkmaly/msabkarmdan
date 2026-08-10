import * as React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Install from "./pages/Install";
import Media from "./pages/Media";
import Teachers from "./pages/Teachers";
import Awards from "./pages/Awards";
import Donors from "./pages/Donors";
import Expenses from "./pages/Expenses";
import Certificates from "./pages/Certificates";
import NotFound from "./pages/NotFound";
import OAuthConsent from "./pages/OAuthConsent";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import ViewAsBanner from "./components/ViewAsBanner";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جارٍ التحميل...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جارٍ التحميل...</div>;
  if (user) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return <Navigate to={safe} replace />;
  }
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ViewAsBanner />
          <Routes>
            <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/media" element={<ProtectedRoute><Media /></ProtectedRoute>} />
            <Route path="/teachers" element={<ProtectedRoute><Teachers /></ProtectedRoute>} />
            <Route path="/awards" element={<ProtectedRoute><Awards /></ProtectedRoute>} />
            <Route path="/donors" element={<ProtectedRoute><Donors /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
            <Route path="/certificates" element={<ProtectedRoute><Certificates /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/install" element={<Install />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <SpeedInsights />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
