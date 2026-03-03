import React from 'react';
import ReactMarkdown from 'react-markdown';

export function chatMessageFormatter(message: string): React.ReactNode {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {message}
    </ReactMarkdown>
  );
}
