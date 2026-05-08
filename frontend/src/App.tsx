import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";

import { store, useAppSelector } from "@/store";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ThemeProvider } from "@/components/theme-provider";
import { AppHeader } from "@/components/AppHeader";
import { PageFetchBar } from "@/components/PageFetchBar";
import { Toaster } from "@/components/ui/sonner";
import { Login } from "@/pages/Login";
import { Campaigns } from "@/pages/Campaigns";
import { CampaignNew } from "@/pages/CampaignNew";
import { CampaignDetail } from "@/pages/CampaignDetail";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Layout({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageFetchBar />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-background focus:outline-none focus:ring-2 focus:ring-accent"
      >
        Skip to content
      </a>
      <AppHeader />
      <main
        id="main"
        tabIndex={-1}
        className={
          user
            ? "mx-auto max-w-6xl px-4 py-6 focus:outline-none sm:px-6 sm:py-10 md:py-14 lg:px-8"
            : "mx-auto flex min-h-screen max-w-md items-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] focus:outline-none sm:px-6"
        }
      >
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/campaigns"
          element={
            <ProtectedRoute>
              <Campaigns />
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/new"
          element={
            <ProtectedRoute>
              <CampaignNew />
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:id"
          element={
            <ProtectedRoute>
              <CampaignDetail />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/campaigns" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-right" richColors closeButton />
          </BrowserRouter>
        </QueryClientProvider>
      </Provider>
    </ThemeProvider>
  );
}
