import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../i18n";

export default function NetworkBadge() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const t = useT();

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
      <span>{online ? t("network.online") : t("network.offline")}</span>
    </span>
  );
}
