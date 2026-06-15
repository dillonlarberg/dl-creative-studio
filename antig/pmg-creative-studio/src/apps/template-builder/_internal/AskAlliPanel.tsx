import { useState, useRef, useEffect } from 'react';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { TemplateBuilderStepData, AlliAction, RequirementField } from '../types';

const PROXY = '/api/helloWorld';

const TRANSFORM_LABELS: Record<string, string> = {
  remove_bg: 'Remove BG',
  enhance: 'Enhance',
  reframe: 'Smart Crop',
  title_case: 'Title Case',
  uppercase: 'ALL CAPS',
  truncate_50: 'Truncate 50',
};

interface AskAlliPanelProps {
  stepData: TemplateBuilderStepData;
  mergeStepData: (patch: Partial<TemplateBuilderStepData>) => void;
  onClose: () => void;
  targetFieldId?: string | null;
  requirements: RequirementField[];
  feedColumns: string[];
  brand: { primaryColor?: string; fontPrimary?: string } | null;
}

export function AskAlliPanel({
  stepData,
  mergeStepData,
  onClose,
  targetFieldId,
  requirements,
  feedColumns,
  brand,
}: AskAlliPanelProps) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = stepData.askAlliMessages ?? [];

  const displayMessages = messages.length === 0
    ? [{ role: 'assistant' as const, content: "I can help you configure this template. Ask me to map fields, assign slots, or apply transformations — like removing a background or converting text to title case.", actions: [] as AlliAction[] }]
    : messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, isLoading]);

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isLoading) return;

    const userMessage = { role: 'user' as const, content: text };
    const updatedMessages = [...messages, userMessage];
    mergeStepData({ askAlliMessages: updatedMessages });
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch(`${PROXY}?templateAI=chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          templateContext: {
            channel: stepData.channel ?? 'Social',
            brief: stepData.brief,
            brand,
            fieldMappings: stepData.feedMappings ?? {},
            slotMappings: stepData.slotMappings ?? {},
            fieldTransforms: stepData.fieldTransforms ?? {},
            requirements: requirements.map((r) => ({ id: r.id, label: r.label, type: r.type })),
            feedColumns,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ask Alli error (${res.status}): ${errText}`);
      }

      const data = await res.json() as { content: string; actions?: AlliAction[] };
      const assistantMessage = {
        role: 'assistant' as const,
        content: data.content,
        actions: data.actions ?? [],
      };

      const newTransforms = { ...(stepData.fieldTransforms ?? {}) };
      const newMappings = { ...(stepData.feedMappings ?? {}) };
      const newSlots = { ...(stepData.slotMappings ?? {}) };

      for (const action of (data.actions ?? [])) {
        if (action.type === 'add_transform') {
          const existing = newTransforms[action.fieldId] ?? [];
          if (!existing.includes(action.transform)) {
            newTransforms[action.fieldId] = [...existing, action.transform];
          }
        } else if (action.type === 'remove_transform') {
          newTransforms[action.fieldId] = (newTransforms[action.fieldId] ?? []).filter(
            (t) => t !== action.transform
          );
          if ((newTransforms[action.fieldId] ?? []).length === 0) delete newTransforms[action.fieldId];
        } else if (action.type === 'suggest_mapping') {
          newMappings[action.fieldId] = action.column;
        } else if (action.type === 'suggest_slot') {
          newSlots[action.fieldId] = action.slotId;
        }
      }

      mergeStepData({
        askAlliMessages: [...updatedMessages, assistantMessage],
        fieldTransforms: newTransforms,
        feedMappings: newMappings,
        slotMappings: newSlots,
      });
    } catch (err) {
      const errorMessage = {
        role: 'assistant' as const,
        content: `Something went wrong: ${(err as Error).message}`,
        actions: [] as AlliAction[],
      };
      mergeStepData({ askAlliMessages: [...updatedMessages, errorMessage] });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-[13px] font-semibold text-indigo-600">Ask Alli</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close Ask Alli"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Target field context pill */}
      {targetFieldId && (
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 shrink-0">
          <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
            Asking about: {requirements.find((r) => r.id === targetFieldId)?.label ?? targetFieldId}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {displayMessages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed',
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm'
              )}
            >
              <p>{msg.content}</p>
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.actions.map((action, ai) => (
                    <span
                      key={ai}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[9px] font-black uppercase tracking-wide"
                    >
                      {action.type === 'add_transform' && `✓ ${TRANSFORM_LABELS[action.transform] ?? action.transform} → ${action.fieldId}`}
                      {action.type === 'remove_transform' && `✕ ${action.transform} → ${action.fieldId}`}
                      {action.type === 'suggest_mapping' && `→ ${action.fieldId}: ${action.column}`}
                      {action.type === 'suggest_slot' && `→ ${action.fieldId}: ${action.slotId}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0 border-t border-gray-100">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#eef0f6',
            borderRadius: 9999,
            padding: '6px 6px 6px 14px',
            gap: 8,
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendMessage(); }}
            placeholder="Ask Alli about this template…"
            disabled={isLoading}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              color: '#374151',
              padding: 0,
            }}
          />
          <button
            type="button"
            disabled={!inputText.trim() || isLoading}
            onClick={() => void sendMessage()}
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: inputText.trim() && !isLoading
                ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
                : '#c4c6d4',
              border: 'none',
              cursor: inputText.trim() && !isLoading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
            aria-label="Send message"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
