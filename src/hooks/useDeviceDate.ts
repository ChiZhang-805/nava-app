import { useEffect, useState } from "react";
import { todayISO } from "../services/date";

function millisecondsUntilNextLocalDay() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 250);
  return Math.max(250, next.getTime() - now.getTime());
}

export default function useDeviceDate() {
  const [deviceDate, setDeviceDate] = useState(() => todayISO());

  useEffect(() => {
    let midnightTimer = 0;
    const sync = () => {
      setDeviceDate((current) => {
        const next = todayISO();
        return current === next ? current : next;
      });
      window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(sync, millisecondsUntilNextLocalDay());
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") sync();
    };

    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, []);

  return deviceDate;
}
