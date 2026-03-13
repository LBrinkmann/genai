import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Header from '../components/Header';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';

const initialMessages = [
  {
    role: 'user',
    content: 'What is machine learning?',
    index: 0,
  },
  {
    role: 'assistant',
    content: [
      {
        bot: 'Bot A',
        text: 'Machine learning is a subset of artificial intelligence...',
      },
      {
        bot: 'Bot B',
        text: 'ML is a field of study that gives computers the ability...',
      },
    ],
    index: 1,
    selected: 0,
  },
  {
    role: 'user',
    content: 'Can you give me an example?',
    index: 2,
  },
  {
    role: 'assistant',
    content: [
      {
        bot: 'Bot A',
        text: 'A common example is email spam filtering...',
      },
      {
        bot: 'Bot B',
        text: 'Consider recommendation systems like Netflix...',
      },
    ],
    index: 3,
    selected: null,
  },
];

function ChatPage() {
  const [messages, setMessages] = useState(initialMessages);

  const handleSend = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: text,
        index: prev.length,
      },
    ]);
  }, []);

  const handleSelectResponse = useCallback((messageIndex, responseIdx) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.index === messageIndex
          ? { ...msg, selected: responseIdx }
          : msg
      )
    );
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Header status="online" />
      <MessageList
        messages={messages}
        onSelectResponse={handleSelectResponse}
      />
      <MessageInput onSend={handleSend} />
    </Box>
  );
}

export default ChatPage;
