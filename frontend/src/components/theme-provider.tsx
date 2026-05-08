import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  // `enableSystem` lets first-visit users land on their OS preference. The toggle
  // only writes explicit "light" / "dark", so "system" is never user-facing after
  // the first interaction.
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    />
  );
}
