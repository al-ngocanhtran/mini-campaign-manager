import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAppDispatch } from "@/store";
import { setCredentials } from "@/store/authSlice";
import * as api from "@/api/client";
import { ApiError } from "@/api/client";
import { validateEmail, validateName, validatePassword } from "@/lib/validators";

type FieldErrors = { email?: string; name?: string; password?: string };

export function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const setFieldError = (field: keyof FieldErrors, msg: string | null) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (msg) next[field] = msg;
      else delete next[field];
      return next;
    });
  };

  const validateAll = (): FieldErrors => {
    const errs: FieldErrors = {};
    const emailErr = validateEmail(email);
    if (emailErr) errs.email = emailErr;
    if (isRegister) {
      const nameErr = validateName(name);
      if (nameErr) errs.name = nameErr;
      const pwErr = validatePassword(password);
      if (pwErr) errs.password = pwErr;
    } else if (!password) {
      errs.password = "Password is required";
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const errs = validateAll();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const result = isRegister
        ? await api.register({ email, name, password })
        : await api.login({ email, password });

      dispatch(setCredentials(result));
      navigate("/campaigns");
    } catch (err) {
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length > 0) {
        setFieldErrors(err.fields);
        setError("");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
      <div className="mb-6 flex items-center justify-center gap-2 font-serif text-xl tracking-tight sm:mb-8">
        <span className="grid size-8 place-items-center rounded-md bg-foreground text-background">
          <Mail className="size-4" strokeWidth={2.5} />
        </span>
        <span>Campaign Manager</span>
      </div>

      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="font-serif text-2xl font-medium tracking-tight">
            {isRegister ? "Create your account" : "Welcome back"}
          </CardTitle>
          <CardDescription>
            {isRegister
              ? "Start sending campaigns in under a minute."
              : "Sign in to manage your campaigns."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setFieldError("email", validateEmail(email))}
                aria-invalid={!!fieldErrors.email}
                placeholder="you@example.com"
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              )}
            </div>

            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setFieldError("name", validateName(name))}
                  aria-invalid={!!fieldErrors.name}
                  placeholder="Your name"
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive">{fieldErrors.name}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() =>
                    isRegister
                      ? setFieldError("password", validatePassword(password))
                      : setFieldError("password", password ? null : "Password is required")
                  }
                  aria-invalid={!!fieldErrors.password}
                  placeholder={isRegister ? "At least 12 characters" : "Your password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="password"
                  className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" strokeWidth={2} />
                  ) : (
                    <Eye className="size-4" strokeWidth={2} />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              )}
              {isRegister && !fieldErrors.password && (
                <p className="text-xs text-muted-foreground">
                  At least 12 characters. Avoid common passwords.
                </p>
              )}
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {isRegister ? "Create account" : "Sign in"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex-col gap-1 text-center text-sm text-muted-foreground sm:flex-row sm:justify-center sm:gap-0">
          <span>
            {isRegister ? "Already have an account?" : "Don't have an account?"}
          </span>
          <Button
            type="button"
            variant="link"
            className="h-auto px-1.5 py-0 text-sm"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
              setFieldErrors({});
            }}
          >
            {isRegister ? "Sign in" : "Create one"}
          </Button>
        </CardFooter>
      </Card>

      <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
        Mini Campaign Manager · Demo
      </p>
    </div>
  );
}
