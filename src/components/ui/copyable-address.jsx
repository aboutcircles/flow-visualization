import { useState } from 'react';
import { checksumAddr } from '@/lib/utils';

// Shows address (or optional label), copies full checksummed address on click.
export default function CopyableAddress({ address, label, className = '' }) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  const full = checksumAddr(address);
  const display = label ?? `${full.slice(0, 6)}…${full.slice(-4)}`;

  const handleClick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(full).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`${full}\n(click to copy)`}
      className={`cursor-pointer hover:text-blue-600 transition-colors ${copied ? 'text-green-600' : ''} ${className}`}
    >
      {copied ? '✓' : display}
    </button>
  );
}
