import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Drawer({ open, title, onClose, children }) {
  const [shouldRender, setRender] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (open) {
      setRender(true);
      // Wait a frame so the DOM node exists with 'opacity-0' before switching to 'opacity-100'
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
    } else {
      setAnimateIn(false);
      setTimeout(() => setRender(false), 300);
    }
  }, [open]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end m-0 p-0">
      <div 
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`} 
        onClick={onClose} 
      />
      <div 
        className={`relative h-full w-full max-w-lg overflow-y-auto border-l border-border bg-canvas p-6 transition-transform duration-300 ${animateIn ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
