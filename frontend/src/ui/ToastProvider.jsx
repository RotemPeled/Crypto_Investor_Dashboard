import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, type }

  const push = useCallback((message, type = "success", ms = 3000) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), ms);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}

      {toast ? (
        <div className="toastCenterOverlay" role="status" aria-live="polite">
          <div className={`toastCenter toast-${toast.type}`}>
            {toast.message}
          </div>
        </div>
      ) : null}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
