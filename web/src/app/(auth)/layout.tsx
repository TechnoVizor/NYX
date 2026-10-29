// Sign-in and onboarding are brand surfaces with no user yet: always NYX dark, whatever theme the browser remembers.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div data-theme="nyx" className="dark min-h-dvh bg-background text-foreground [color-scheme:dark]">
      {children}
    </div>
  );
}
