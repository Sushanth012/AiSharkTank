import { ArrowRight, MessageCircleQuestion } from "lucide-react";

export function FeedbackHelp({ explanation, nextStep }: { explanation: string; nextStep: string }) {
  return (
    <details className="feedback-help">
      <summary><MessageCircleQuestion size={16} aria-hidden="true" /> Explain this simply</summary>
      <div className="feedback-help-body">
        <div><span>What this means</span><p>{explanation}</p></div>
        <div className="feedback-next-step"><ArrowRight size={17} aria-hidden="true" /><span><strong>What should I do next?</strong>{nextStep}</span></div>
      </div>
    </details>
  );
}
