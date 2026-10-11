import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
        }),
      });

      if (res.ok) {
        // Full reload so App.tsx re-checks /api/auth/user
        window.location.href = "/";
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Invalid credentials");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ambient-canvas min-h-[100dvh] w-full flex items-center justify-center">
      <div className="w-full max-w-sm px-6 flex flex-col items-center animate-fade-up">
        <div className="mb-10 text-center space-y-2">
          <h1 className="text-balance text-3xl font-bold tracking-widest text-gold-ink uppercase">
            Auron Business OS
          </h1>
          <p className="text-sm text-muted-foreground tracking-wide">
            COMMAND CENTER &bull; EXECUTIVE ACCESS
          </p>
        </div>

        <div className="glass-strong w-full rounded-3xl p-8">
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="space-y-1 text-center mb-2">
              <h2 className="text-xl font-medium">Sign In</h2>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to access the terminal.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ceo"
                disabled={loading}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                className="h-11"
              />
            </div>

            {error && (
              <p role="alert" className="animate-shake text-sm text-destructive text-center bg-destructive/10 border border-destructive/25 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full h-11 font-medium tracking-wide mt-1"
            >
              {loading ? "Signing in…" : "Authorize Access"}
            </Button>
          </form>
        </div>

        <div className="mt-10 text-xs text-muted-foreground tracking-widest uppercase">
          &copy; {new Date().getFullYear()} AURON EVENT PRODUCTIONS
        </div>
      </div>
    </div>
  );
}
