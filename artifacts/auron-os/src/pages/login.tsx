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
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-sm px-6 flex flex-col items-center">
        <div className="mb-10 text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-widest text-[#C9A84C] uppercase">
            Auron Business OS
          </h1>
          <p className="text-sm text-gray-400 tracking-wide">
            COMMAND CENTER &bull; EXECUTIVE ACCESS
          </p>
        </div>

        <div className="w-full bg-[#121212] border border-[#222] p-8 rounded-lg shadow-2xl">
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="space-y-1 text-center mb-2">
              <h2 className="text-xl font-medium text-white">Sign In</h2>
              <p className="text-sm text-gray-500">
                Enter your credentials to access the terminal.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300 text-sm">
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
                className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300 text-sm">
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
                className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full h-11 bg-[#C9A84C] hover:bg-[#b0923f] text-black font-medium tracking-wide mt-1"
            >
              {loading ? "Signing in…" : "Authorize Access"}
            </Button>
          </form>
        </div>

        <div className="mt-10 text-xs text-gray-600 tracking-widest uppercase">
          &copy; {new Date().getFullYear()} AURON EVENT PRODUCTIONS
        </div>
      </div>
    </div>
  );
}
