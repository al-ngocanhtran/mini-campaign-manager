import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { store, useAppSelector, useAppDispatch } from "./store";
import { logout } from "./store/authSlice";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Campaigns } from "./pages/Campaigns";
import { CampaignNew } from "./pages/CampaignNew";
import { CampaignDetail } from "./pages/CampaignDetail";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Layout({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();

  return (
    <div className="min-h-screen bg-gray-50">
      {user && (
        <nav className="bg-white border-b">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="font-bold text-gray-900">Campaign Manager</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{user.email}</span>
              <button
                onClick={() => dispatch(logout())}
                className="text-sm text-red-600 hover:underline"
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>
      )}
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
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
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  );
}
