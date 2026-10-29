import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Menu, Plus, Sparkles, Volume2, VolumeX } from "lucide-react";
import { ChatView } from "@/components/ai/ChatView";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import { useSpeechOutput } from "@/hooks/useSpeech";
import { setAppMode } from "@/lib/appMode";

const AUTO_SPEAK_KEY = "agritrade_lite_auto_speak";

function loadAutoSpeak(): boolean {
  try {
    return localStorage.getItem(AUTO_SPEAK_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * The simple version: one full-screen, voice-first chat for traders who
 * don't read or write comfortably. Replies are read aloud unless turned off.
 */
export function LitePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const speech = useSpeechOutput();
  const [autoSpeak, setAutoSpeak] = useState(loadAutoSpeak);
  const [menuOpen, setMenuOpen] = useState(false);

  const chat = useAssistantChat({
    onReply: (reply) => {
      if (autoSpeak) speech.speak(reply.id, reply.content);
    },
  });

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_SPEAK_KEY, autoSpeak ? "on" : "off");
    } catch {
      // Blocked storage: the setting lasts for this visit.
    }
  }, [autoSpeak]);

  function toggleAutoSpeak() {
    if (autoSpeak) speech.stop();
    setAutoSpeak(!autoSpeak);
  }

  function switchToFull() {
    speech.stop();
    setAppMode("full");
    navigate("/", { replace: true });
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b bg-background/95 px-3 py-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#263821] text-accent">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="flex-1 text-lg font-semibold">AgriTrade</p>
        {speech.supported && (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={toggleAutoSpeak}
            aria-label={autoSpeak ? "Stop reading answers aloud" : "Read answers aloud"}
            aria-pressed={autoSpeak}
          >
            {autoSpeak ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6 text-muted-foreground" />}
          </Button>
        )}
        {chat.messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => {
              speech.stop();
              chat.clear();
            }}
            disabled={chat.sending}
            aria-label="Start again"
          >
            <Plus className="h-6 w-6" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setMenuOpen(true)} aria-label="Menu">
          <Menu className="h-6 w-6" />
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        <ChatView variant="lite" chat={chat} speech={speech} />
      </div>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <div className="space-y-3">
          <Button variant="outline" className="h-14 w-full justify-start text-base" onClick={switchToFull}>
            <LayoutDashboard className="h-5 w-5" /> Full version
          </Button>
          <Button variant="outline" className="h-14 w-full justify-start text-base" onClick={logout}>
            <LogOut className="h-5 w-5" /> Log out
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
