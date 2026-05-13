import React, { useState } from 'react';

/**
 * Tailwind-only message input matching the prototype Chat.jsx markup.
 * Single-line `<input>` + white "Send" button. Loading state dims the
 * send button with a subtle pulse — no MUI spinner on the chat surface.
 */
function MessageInput({ onSend, disabled = false }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (onSend) onSend(trimmed);
    setValue('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-2xl gap-3"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type your message..."
        disabled={disabled}
        className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-600 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className={`shrink-0 rounded-xl bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed ${
          disabled ? 'animate-pulse opacity-60' : 'disabled:opacity-50'
        }`}
      >
        Send
      </button>
    </form>
  );
}

export default MessageInput;
