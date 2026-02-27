import { useRef, useState } from 'react';

const USERNAME_REGEX = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/;

function getInitialUsername() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const candidate = (params.get('user') || '').trim();
  return USERNAME_REGEX.test(candidate) ? candidate : '';
}

export default function App() {
  const [inputUsername, setInputUsername] = useState(() => getInitialUsername());
  const [activeUsername, setActiveUsername] = useState(() => getInitialUsername());
  const [error, setError] = useState('');
  const iframeRef = useRef(null);

  function resizeIframe() {
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const nextHeight = Math.max(
        doc.documentElement?.scrollHeight || 0,
        doc.body?.scrollHeight || 0
      );
      if (nextHeight > 0) {
        frame.style.height = `${nextHeight}px`;
      }
    } catch (_) {
      // Same-origin expected in local/deployed use. Ignore if inaccessible.
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const candidate = inputUsername.trim();

    if (!USERNAME_REGEX.test(candidate)) {
      setError('Enter a valid GitHub username.');
      return;
    }

    setError('');
    setActiveUsername(candidate);

    const url = new URL(window.location.href);
    url.searchParams.set('user', candidate);
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-10">
      <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">wende/gitcard</p>

      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 sm:flex-row">
        <input
          value={inputUsername}
          onChange={(event) => setInputUsername(event.target.value)}
          type="text"
          name="github-handle"
          placeholder="GitHub handle"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
        />
        <button
          type="submit"
          className="h-11 w-full rounded-[1.25rem] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto"
        >
          Generate
        </button>
      </form>

      {error ? <p className="mt-3 text-center text-sm text-rose-600">{error}</p> : null}

      {activeUsername ? (
        <iframe
          ref={iframeRef}
          key={activeUsername}
          src={`/api/card/${encodeURIComponent(activeUsername)}/`}
          title={`Git card for ${activeUsername}`}
          className="mt-8 w-full border-0"
          style={{ height: '1200px' }}
          onLoad={resizeIframe}
        />
      ) : null}
    </div>
  );
}
