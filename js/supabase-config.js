window.SUPABASE_CONFIG = {
  url: "https://crzulknhwcvhepajsxnl.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyenVsa25od2N2aGVwYWpzeG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTY5MjQsImV4cCI6MjA4OTA5MjkyNH0.EwbPzEZ4LQMrHxDLEz0MElsAdPj2k9DPXFl_2Kczbyw"
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