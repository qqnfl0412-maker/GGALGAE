window.SUPABASE_CONFIG = {
  url: "https://sevcyxdszwxioyuficjt.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNldmN5eGRzend4aW95dWZpY2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzU4NDMsImV4cCI6MjA5MTk1MTg0M30.dooFsClv_gGg6gO0vsatPcfVOdMqZirvYXyQaISxtLc"
};

function initSupabase() {
  if (!window.supabase) {
    alert("Supabase 라이브러리를 불러오지 못했어.");
    return;
  }

  const config = window.SUPABASE_CONFIG || {};
  const url = config.url || "";
  const anonKey = config.anonKey || "";

  if (!url || url.includes("여기에_")) {
    if (typeof setSyncStatus === "function") {
      setSyncStatus("Supabase URL 설정 필요");
    }
    return;
  }

  if (!anonKey || anonKey.includes("YOUR_")) {
    if (typeof setSyncStatus === "function") {
      setSyncStatus("Supabase Key 설정 필요");
    }
    return;
  }

  window.supabaseClient = window.supabase.createClient(url, anonKey);

  if (typeof setSyncStatus === "function") {
    setSyncStatus("서버 연결 준비 완료");
  }
}