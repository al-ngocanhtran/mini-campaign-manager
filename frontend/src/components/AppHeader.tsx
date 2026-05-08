import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut, Mail, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";
import { useAppDispatch, useAppSelector } from "@/store";
import { logout } from "@/store/authSlice";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link
          to="/campaigns"
          className="flex min-w-0 items-center gap-2 font-serif text-lg tracking-tight"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
            <Mail className="size-3.5" strokeWidth={2.5} />
          </span>
          <span className="truncate font-medium">Campaign&nbsp;Manager</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex">
          <NavItem to="/campaigns">Campaigns</NavItem>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden md:flex md:items-center md:gap-1">
            <ModeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 font-mono text-xs"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-muted font-sans font-medium text-foreground">
                    {user.email[0]?.toUpperCase()}
                  </span>
                  <span className="hidden sm:inline">{user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="font-sans text-sm font-medium">
                    {user.name || user.email}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => dispatch(logout())}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" strokeWidth={2} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-72 flex-col gap-0 p-0"
            >
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle className="flex items-center gap-2 font-serif text-lg font-medium tracking-tight">
                  <span className="grid size-7 place-items-center rounded-md bg-foreground text-background">
                    <Mail className="size-3.5" strokeWidth={2.5} />
                  </span>
                  Campaign Manager
                </SheetTitle>
              </SheetHeader>

              <nav className="flex flex-col px-2 py-3">
                <SheetClose asChild>
                  <NavLink
                    to="/campaigns"
                    className={({ isActive }) =>
                      cn(
                        "rounded-md px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        isActive && "bg-muted text-foreground",
                      )
                    }
                  >
                    Campaigns
                  </NavLink>
                </SheetClose>
              </nav>

              <Separator />

              <div className="flex items-center justify-between px-5 py-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Theme
                </span>
                <ModeToggle />
              </div>

              <Separator />

              <div className="flex items-center gap-3 px-5 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted font-sans text-sm font-medium text-foreground">
                  {user.email[0]?.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-sans text-sm font-medium">
                    {user.name || user.email}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>

              <div className="mt-auto border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button
                  variant="outline"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => {
                    dispatch(logout());
                    setMobileNavOpen(false);
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
          isActive && "text-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}
