"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RefreshData({ interval = 10000 }: { interval?: number }) {
  const router = useRouter();

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") router.refresh();
    }
    const timer = window.setInterval(refresh, interval);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [interval, router]);

  return null;
}
