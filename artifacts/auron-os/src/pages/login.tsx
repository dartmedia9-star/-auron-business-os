import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

export default function LoginScreen() {
  const { login } = useAuth();

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-md p-8 flex flex-col items-center">
        <div className="mb-12 text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-widest text-[#C9A84C] uppercase">
            Auron Business OS
          </h1>
          <p className="text-sm text-gray-400 tracking-wide">
            COMMAND CENTER &bull; EXECUTIVE ACCESS
          </p>
        </div>
        
        <div className="w-full bg-[#121212] border border-[#222] p-8 rounded-lg shadow-2xl">
          <div className="flex flex-col gap-6">
            <div className="space-y-1 text-center">
              <h2 className="text-xl font-medium text-white">Sign In</h2>
              <p className="text-sm text-gray-500">Authenticate to access the terminal.</p>
            </div>
            
            <Button 
              onClick={login} 
              className="w-full h-12 bg-[#C9A84C] hover:bg-[#b0923f] text-black font-medium tracking-wide"
            >
              Authorize Access
            </Button>
          </div>
        </div>
        
        <div className="mt-12 text-xs text-gray-600 tracking-widest uppercase">
          &copy; {new Date().getFullYear()} AURON EVENT PRODUCTIONS
        </div>
      </div>
    </div>
  );
}
