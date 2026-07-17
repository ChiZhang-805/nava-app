import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function NetworkBadge() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <span className={online ? "network-badge online" : "network-badge offline"}>
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
      <span>{online ? "在线" : "离线"}</span>
    </span>
  );
}

