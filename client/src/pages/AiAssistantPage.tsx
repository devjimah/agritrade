import { ChatView } from "@/components/ai/ChatView";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import { useSpeechOutput } from "@/hooks/useSpeech";

export function AiAssistantPage() {
  const chat = useAssistantChat();
  const speech = useSpeechOutput();

  // Fill the viewport under AppLayout's 61px header and main's vertical padding,
  // so the message list scrolls and the composer stays put.
  return (
    <div className="h-[calc(100dvh-61px-2.5rem)] lg:h-[calc(100dvh-61px-4rem)]">
      <ChatView variant="full" chat={chat} speech={speech} />
    </div>
  );
}
