import React, { useEffect, useState } from 'react';
import { SimultaneousEntropyMessage } from '../components/effects/SimultaneousEntropyMessage';

/**
 * Temporary verification route for Phase 1 of the design integration.
 * Wired at `/__effect-sandbox`. NOT for production — the `__` prefix marks it.
 * Renders three messages so the reviewer can:
 *  - confirm the canvas dissolve renders correctly,
 *  - confirm the reduced-motion fallback swaps to plain DOM + 200ms fade.
 */
function EffectSandbox() {
  const [evictThird, setEvictThird] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setEvictThird(true), 3000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="bg-zinc-950 min-h-screen w-full p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <SimultaneousEntropyMessage
          content="Hello. I am an assistant message rendered in the warm gold canvas color."
          textColor="#D4A864"
          textAlign="left"
        />
        <SimultaneousEntropyMessage
          content="And I am a user message, aligned right and rendered in light grey."
          textColor="#e0e0e0"
          textAlign="right"
        />
        <SimultaneousEntropyMessage
          content="This third assistant message starts dissolving three seconds after mount."
          textColor="#D4A864"
          textAlign="left"
          evict={evictThird}
          onEvicted={() => {
            // eslint-disable-next-line no-console
            console.log('[EffectSandbox] third message evicted');
          }}
        />
      </div>
    </div>
  );
}

export default EffectSandbox;
