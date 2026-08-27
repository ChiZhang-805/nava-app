import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { seedThirteenDayHistory } from "../services/devSeedHistory";

export default function DevSeedPanel({ user }: { user: User }) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState("将前13天完整模拟数据写入当前账号，今天保持为空。不会覆盖已有记录。");

  if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get("seedHistory") !== "1") return null;

  const seed = async () => {
    setStatus("running");
    setMessage("正在生成睡眠、饮食、运动、情绪、专注、面部状态与节律数据…");
    try {
      const result = await seedThirteenDayHistory(user.id);
      setStatus("done");
      setMessage(`已写入 ${result.startDate} 至 ${result.endDate} 的 ${result.days} 天数据；${result.anchorDate} 留作第14天。`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside className={`dev-seed-panel is-${status}`} aria-label="第14天模拟数据工具">
      <strong>第14天模拟数据</strong>
      <p>{message}</p>
      <button type="button" onClick={seed} disabled={status === "running" || status === "done"}>
        {status === "running" ? "生成中…" : status === "done" ? "已完成" : "生成前13天数据"}
      </button>
    </aside>
  );
}
