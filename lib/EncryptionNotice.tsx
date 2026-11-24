'use client';

/**
 * Tells the person what went wrong with the call's end-to-end encryption:
 * a banner over the call, or the whole page when the call could not start
 * encrypted (meet never joins a keyed call in the clear).
 */
/** What the person reads when encryption reports an error; LiveKit's own text goes to the console. */
export function encryptionErrorMessage(who?: string): string {
  return who
    ? `Can't decrypt ${who}. They may not have this call's key.`
    : `Something went wrong with this call's encryption.`;
}

/** What the person reads when a call with a key can't start encrypted. */
export const E2EE_UNSUPPORTED_MESSAGE =
  "Your browser doesn't support end-to-end encryption. Please update it to the latest version and try again.";
export const E2EE_FAILED_MESSAGE = 'Encryption could not be turned on.';

export function EncryptionNotice(props: {
  messages: string[];
  fatal?: boolean;
  onDismiss?: (message: string) => void;
}) {
  if (props.messages.length === 0) return null;
  if (props.fatal) {
    return (
      <div
        role="alert"
        data-testid="encryption-fatal"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          height: '100dvh',
          padding: '2rem',
          textAlign: 'center',
          color: 'white',
        }}
      >
        <h2 style={{ margin: 0 }}>This call is end-to-end encrypted, and encryption failed</h2>
        {props.messages.map((m) => (
          <p key={m} style={{ margin: 0, maxWidth: '40rem', opacity: 0.85 }}>
            {m}
          </p>
        ))}
        <p style={{ margin: 0, opacity: 0.7 }}>You were not connected.</p>
      </div>
    );
  }
  return (
    <div
      role="alert"
      data-testid="encryption-notice"
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        maxWidth: 'min(90vw, 40rem)',
      }}
    >
      {props.messages.map((m) => (
        <div
          key={m}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            background: '#7f1d1d',
            color: 'white',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: '0.85em',
          }}
        >
          <span style={{ flex: 1 }}>{m}</span>
          {props.onDismiss && (
            <button
              aria-label="Dismiss"
              onClick={() => props.onDismiss?.(m)}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
