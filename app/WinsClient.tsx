"use client";
import { useState, useEffect, useRef } from "react";

interface Win {
  id: string;
  imageId: string;
  channel: string;
  amountWon: string;
  comment: string;
  userName: string;
  userId: string;
  userTier: string;
  fires: number;
  createdAt: string;
}

interface Props {
  authenticated: boolean;
  userName: string;
  userId: string;
  userTier: string;
}

const CHANNELS = [
  { value: "maxbet", label: "Max Bet POTD", icon: "🔥", cls: "ch-maxbet" },
  { value: "straight", label: "Straight Bets", icon: "🎯", cls: "ch-straight" },
  { value: "parlays", label: "Parlays", icon: "🎯", cls: "ch-parlays" },
  { value: "dotd", label: "Dog of the Day", icon: "🐕", cls: "ch-dotd" },
  { value: "plusmoney", label: "Plus Money", icon: "💰", cls: "ch-plus" },
  { value: "lottos", label: "Lottos", icon: "🎰", cls: "ch-lottos" },
];

const TIER_CONFIG: Record<string, { label: string; icon: string; cls: string; avatarCls: string }> = {
  highrollers: { label: "High Rollers", icon: "👑", cls: "tier-hr", avatarCls: "av-hr" },
  premium: { label: "Premium", icon: "💎", cls: "tier-prem", avatarCls: "av-prem" },
  playerprops: { label: "Player Props", icon: "🎯", cls: "tier-props", avatarCls: "av-props" },
  free: { label: "Member", icon: "", cls: "tier-free", avatarCls: "av-free" },
};

export default function WinsClient({ authenticated, userName, userId, userTier }: Props) {
  const [wins, setWins] = useState<Win[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminSecret, setAdminSecret] = useState("");

  // Form state
  const [formChannel, setFormChannel] = useState("maxbet");
  const [formAmount, setFormAmount] = useState("");
  const [formComment, setFormComment] = useState("");
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Image cache
  const [imageCache, setImageCache] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchWins();
    const interval = setInterval(fetchWins, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchWins = async () => {
    try {
      const res = await fetch("/api/wins");
      const data = await res.json();
      setWins(data.wins || []);
      setStats(data.stats || {});
    } catch {}
    setLoading(false);
  };

  // Lazy load images
  const loadImage = async (imageId: string) => {
    if (imageCache[imageId]) return;
    try {
      const res = await fetch(`/api/upload?id=${imageId}`);
      const data = await res.json();
      if (data.imageBase64) {
        setImageCache((prev) => ({ ...prev, [imageId]: data.imageBase64 }));
      }
    } catch {}
  };

  useEffect(() => {
    wins.forEach((w) => {
      if (w.imageId && !imageCache[w.imageId]) {
        loadImage(w.imageId);
      }
    });
  }, [wins]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 800;
        let w = img.width, h = img.height;
        if (w > maxW) { h = (maxW / w) * h; w = maxW; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.75);
        setFormImage(compressed);
        setFormImagePreview(compressed);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!formImage || !formAmount) {
      setSubmitStatus("Upload a bet slip and enter the amount won");
      return;
    }
    setSubmitting(true);
    setSubmitStatus(null);
    try {
      // Upload image first
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: formImage }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.imageId) throw new Error("Upload failed");

      // Post win
      const winRes = await fetch("/api/wins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: uploadData.imageId,
          channel: formChannel,
          amountWon: formAmount,
          comment: formComment,
          userName,
          userId,
          userTier,
        }),
      });

      if (winRes.ok) {
        setShowModal(false);
        setFormImage(null);
        setFormImagePreview(null);
        setFormAmount("");
        setFormComment("");
        setSubmitStatus(null);
        fetchWins();
      } else {
        const err = await winRes.json();
        setSubmitStatus("Error: " + err.error);
      }
    } catch (e: any) {
      setSubmitStatus("Failed to post win");
    }
    setSubmitting(false);
  };

  const handleFire = async (id: string) => {
    try {
      const res = await fetch("/api/wins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = await res.json();
        setWins((prev) => prev.map((w) => (w.id === id ? { ...w, fires: data.fires } : w)));
      }
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!adminSecret) return;
    try {
      const res = await fetch("/api/wins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setWins((prev) => prev.filter((w) => w.id !== id));
      }
    } catch {}
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const formatRelative = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  const getChannel = (val: string) => CHANNELS.find((c) => c.value === val) || CHANNELS[0];
  const getTier = (val: string) => TIER_CONFIG[val] || TIER_CONFIG.free;

  const filtered = filter === "all" ? wins : wins.filter((w) => {
    if (filter === "highrollers") return w.userTier === "highrollers";
    if (filter === "playerprops") return w.userTier === "playerprops";
    if (filter === "premium") return w.userTier === "premium";
    if (filter === "free") return w.userTier === "free";
    if (filter === "week") {
      return Date.now() - new Date(w.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
    }
    return true;
  });

  const bw = stats.biggestWin;

  return (
    <>
      <style>{styles}</style>
      <div className="wins-wrap">
        <div className="wins-content">
          <header className="hero">
            <div className="hero-badge"><span className="hero-dot"></span> Community Wins</div>
            <h1 className="hero-title">Post Your<br /><span className="gold">Wins</span></h1>
            <p className="hero-sub">Real members. Real slips. Real money.</p>
          </header>

          <div className="stats-grid">
            <div className="sg-card">
              <div className="sg-val green">${(stats.totalWonThisWeek || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              <div className="sg-label">Won This Week</div>
            </div>
            <div className="sg-card">
              <div className="sg-val gold">{stats.winsPosted || 0}</div>
              <div className="sg-label">Wins Posted</div>
            </div>
            <div className="sg-card">
              <div className="sg-val green">{bw ? `$${parseFloat(bw.amountWon).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "$0"}</div>
              <div className="sg-label">Biggest Win</div>
            </div>
          </div>

          {bw && (
            <div className="biggest-win">
              <div className="bw-label">🏆 Biggest Win This Week</div>
              <div className="bw-body">
                <div className={`bw-avatar ${getTier(bw.userTier).avatarCls}`}>{getInitials(bw.userName)}</div>
                <div className="bw-info">
                  <div className="bw-user-row">
                    <span className="bw-name">{bw.userName}</span>
                    {getTier(bw.userTier).icon && <span className={`bw-tier ${getTier(bw.userTier).cls}`}>{getTier(bw.userTier).icon} {getTier(bw.userTier).label}</span>}
                  </div>
                  <div className="bw-pick">{getChannel(bw.channel).label}</div>
                </div>
                <div className="bw-payout">+${parseFloat(bw.amountWon).toLocaleString()}</div>
              </div>
            </div>
          )}

          <div className="post-btn-wrap">
            <button className="post-btn" onClick={() => setShowModal(true)}>📸 Post Your Win</button>
          </div>

          <div className="filter-tabs">
            {[["all", "All"], ["highrollers", "High Rollers"], ["premium", "Premium"], ["playerprops", "Player Props"], ["free", "Free"], ["week", "This Week"]].map(([key, label]) => (
              <button key={key} className={`filter-tab${filter === key ? " active" : ""}`} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>

          {loading && <div className="loading"><div className="spinner" /><p>Loading wins...</p></div>}

          {!loading && filtered.length === 0 && (
            <div className="empty">
              <span className="empty-icon">🏆</span>
              <h3>No Wins Yet</h3>
              <p>Be the first to post a win!</p>
            </div>
          )}

          {filtered.map((win) => {
            const ch = getChannel(win.channel);
            const tier = getTier(win.userTier);
            const imgSrc = imageCache[win.imageId];
            return (
              <div key={win.id} className="win-card">
                <div className="win-header">
                  <div className={`win-avatar ${tier.avatarCls}`}>{getInitials(win.userName)}</div>
                  <div className="win-user-info">
                    <div className="win-user-row">
                      <span className="win-name">{win.userName}</span>
                      {tier.icon && <span className={`win-tier ${tier.cls}`}>{tier.icon} {tier.label}</span>}
                    </div>
                    <div className="win-time">{formatRelative(win.createdAt)}</div>
                  </div>
                </div>
                <div className="win-slip">
                  {imgSrc ? (
                    <img src={imgSrc} className="win-slip-img" alt="Bet slip" />
                  ) : (
                    <div className="win-slip-loading"><div className="spinner" /></div>
                  )}
                </div>
                <div className="win-payout-bar">
                  <span className={`win-channel ${ch.cls}`}>{ch.icon} {ch.label}</span>
                  <span className="win-payout">+${parseFloat(win.amountWon).toLocaleString()}</span>
                </div>
                {win.comment && <div className="win-comment">"{win.comment}"</div>}
                <div className="win-footer">
                  <button className="win-action" onClick={() => handleFire(win.id)}>🔥 {win.fires || 0}</button>
                  {showAdmin && <button className="win-action delete" onClick={() => handleDelete(win.id)}>🗑 Delete</button>}
                </div>
              </div>
            );
          })}

          <div className="join-cta">
            <div className="join-cta-title">These could be your wins</div>
            <div className="join-cta-desc">Join RWTW and start cashing picks with the community.</div>
            <a href="https://whop.com/rwtw/" className="join-cta-btn">Join RWTW — Starting at $29.99</a>
          </div>

          {/* Admin controls */}
          <div className="admin-panel">
            <button className="admin-toggle" onClick={() => setShowAdmin(!showAdmin)}>
              {showAdmin ? "▲ Hide Admin" : "⚙ Admin Controls"}
            </button>
            {showAdmin && (
              <div className="admin-body">
                <div className="admin-field">
                  <label>Admin Secret</label>
                  <input type="password" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} placeholder="Enter secret to enable delete" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Submit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">📸 Post Your Win</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-field">
                <label>Bet Slip Screenshot</label>
                <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }} onChange={handleFileSelect} />
                {formImagePreview ? (
                  <div className="modal-preview-wrap" onClick={() => fileRef.current?.click()}>
                    <img src={formImagePreview} className="modal-preview-img" alt="Preview" />
                    <div className="modal-preview-change">Tap to change</div>
                  </div>
                ) : (
                  <div className="modal-upload" onClick={() => fileRef.current?.click()}>
                    <span className="modal-upload-icon">📸</span>
                    <span className="modal-upload-text">Upload Your Bet Slip</span>
                    <span className="modal-upload-sub">Show the receipt</span>
                  </div>
                )}
              </div>
              <div className="modal-field">
                <label>Which RWTW Channel?</label>
                <select value={formChannel} onChange={(e) => setFormChannel(e.target.value)}>
                  {CHANNELS.map((ch) => (
                    <option key={ch.value} value={ch.value}>{ch.icon} {ch.label}</option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>Amount Won</label>
                <input type="text" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="e.g. 948" />
              </div>
              <div className="modal-field">
                <label>Comment (optional)</label>
                <textarea value={formComment} onChange={(e) => setFormComment(e.target.value)} rows={2} placeholder="Talk your shit 🔥" />
              </div>
              {submitStatus && <p className="submit-status">{submitStatus}</p>}
              <button className="modal-submit" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Posting..." : "Post Win 🔥"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
  --gold:#d4a843;--gold-hi:#f0c95c;--gold-lo:#a07c2e;
  --fire:#e8522a;
  --blue:#4ea8f6;--green:#4ade80;--red:#ef4444;--purple:#a855f7;
  --txt:#f5f1eb;--txt2:rgba(245,241,235,.55);--txt3:rgba(245,241,235,.3);
  --border:rgba(255,255,255,.08);--glass:rgba(255,255,255,.03);--card-bg:rgba(255,255,255,.04);
  --page-bg:#111113;
}
body{background:var(--page-bg);font-family:'DM Sans',system-ui,-apple-system,sans-serif;color:var(--txt);-webkit-font-smoothing:antialiased}
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=Oswald:wght@400;500;600;700&display=swap');

.wins-wrap{min-height:100vh;overflow-x:hidden}
.wins-content{max-width:500px;margin:0 auto;padding:0 20px 200px}

.hero{text-align:center;padding:44px 0 20px}
.hero-badge{display:inline-flex;align-items:center;gap:8px;padding:7px 18px;border-radius:100px;border:1px solid rgba(74,222,128,.2);background:rgba(74,222,128,.06);font-size:10.5px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--green);margin-bottom:24px;animation:fadeUp .6s ease both}
.hero-dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green);display:inline-block;animation:pulse 1.5s ease-in-out infinite}
.hero-title{font-family:'Bebas Neue','Oswald',sans-serif;font-size:clamp(2.8rem,10vw,4.5rem);line-height:.88;letter-spacing:-1px;animation:fadeUp .6s ease .1s both}
.gold{background:linear-gradient(135deg,var(--gold-hi),var(--gold),var(--gold-lo));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero-sub{font-size:14px;font-weight:300;color:var(--txt2);margin-top:14px;line-height:1.6;animation:fadeUp .6s ease .2s both}

.stats-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;animation:fadeUp .6s ease .25s both}
.sg-card{padding:14px 10px;border-radius:12px;border:1px solid var(--border);background:var(--card-bg);text-align:center}
.sg-val{font-family:'Oswald',sans-serif;font-size:22px;font-weight:700;line-height:1}
.sg-val.green{color:var(--green)}
.sg-val.gold{color:var(--gold)}
.sg-label{font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--txt3);margin-top:4px}

.biggest-win{border-radius:14px;overflow:hidden;margin-bottom:20px;border:1px solid rgba(212,168,67,.2);background:linear-gradient(135deg,rgba(212,168,67,.06),rgba(74,222,128,.03));animation:fadeUp .6s ease .3s both}
.bw-label{display:flex;align-items:center;gap:6px;padding:10px 16px;border-bottom:1px solid rgba(212,168,67,.1);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold)}
.bw-body{padding:16px;display:flex;align-items:center;gap:16px}
.bw-avatar{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:16px;font-weight:700;color:#0a0a0a;flex-shrink:0}
.av-hr{background:linear-gradient(135deg,var(--gold),var(--gold-lo))}
.av-prem{background:linear-gradient(135deg,var(--green),#22c55e)}
.av-free{background:linear-gradient(135deg,var(--blue),#2b7de9)}
.av-props{background:linear-gradient(135deg,var(--purple),#7c3aed)}
.bw-info{flex:1}
.bw-user-row{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap}
.bw-name{font-family:'Oswald',sans-serif;font-size:15px;font-weight:600}
.bw-tier{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 8px;border-radius:4px}
.tier-hr{background:rgba(212,168,67,.12);border:1px solid rgba(212,168,67,.2);color:var(--gold)}
.tier-prem{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);color:var(--green)}
.tier-free{background:rgba(78,168,246,.1);border:1px solid rgba(78,168,246,.2);color:var(--blue)}
.tier-props{background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.2);color:var(--purple)}
.bw-pick{font-size:12px;color:var(--txt2)}
.bw-payout{font-family:'Oswald',sans-serif;font-size:28px;font-weight:700;color:var(--green);white-space:nowrap}

.post-btn-wrap{margin-bottom:20px;animation:fadeUp .6s ease .32s both}
.post-btn{width:100%;padding:14px;border-radius:12px;border:1px dashed rgba(74,222,128,.3);background:rgba(74,222,128,.04);color:var(--green);font-family:'Oswald',sans-serif;font-weight:600;font-size:14px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px}
.post-btn:hover{background:rgba(74,222,128,.08);border-color:rgba(74,222,128,.5)}

.filter-tabs{display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;animation:fadeUp .6s ease .33s both}
.filter-tab{padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--glass);color:var(--txt3);font-family:'Oswald',sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s;white-space:nowrap;flex-shrink:0}
.filter-tab:hover{border-color:var(--gold);color:var(--gold)}
.filter-tab.active{border-color:var(--gold);background:rgba(212,168,67,.1);color:var(--gold)}

.win-card{border-radius:14px;border:1px solid var(--border);background:var(--card-bg);overflow:hidden;margin-bottom:16px;animation:fadeUp .5s ease both}
.win-header{display:flex;align-items:center;gap:12px;padding:12px 16px}
.win-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:13px;font-weight:700;color:#0a0a0a;flex-shrink:0}
.win-user-info{flex:1}
.win-user-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.win-name{font-family:'Oswald',sans-serif;font-size:14px;font-weight:600}
.win-tier{font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:4px}
.win-time{font-size:11px;color:var(--txt3);margin-top:1px}

.win-slip{width:100%;background:#1c1c1e;border-top:1px solid var(--border);border-bottom:1px solid var(--border);min-height:100px;display:flex;align-items:center;justify-content:center}
.win-slip-img{width:100%;display:block}
.win-slip-loading{padding:40px;text-align:center}

.win-payout-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(74,222,128,.04)}
.win-channel{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:4px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:5px}
.ch-maxbet{background:rgba(212,168,67,.08);border:1px solid rgba(212,168,67,.15);color:var(--gold)}
.ch-straight{background:rgba(78,168,246,.08);border:1px solid rgba(78,168,246,.15);color:var(--blue)}
.ch-parlays{background:rgba(232,82,42,.08);border:1px solid rgba(232,82,42,.15);color:var(--fire)}
.ch-dotd{background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.15);color:var(--green)}
.ch-plus{background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.15);color:var(--purple)}
.ch-lottos{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.15);color:#fbbf24}
.win-payout{font-family:'Oswald',sans-serif;font-size:22px;font-weight:700;color:var(--green)}

.win-comment{padding:10px 16px;font-size:13px;color:var(--txt2);line-height:1.5;font-style:italic;border-top:1px solid var(--border)}
.win-footer{padding:10px 16px;border-top:1px solid var(--border);display:flex;align-items:center;gap:16px}
.win-action{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--txt3);cursor:pointer;transition:color .2s;background:none;border:none;font-family:inherit}
.win-action:hover{color:var(--green)}
.win-action.delete{color:var(--red)}
.win-action.delete:hover{color:#ff6b6b}

.loading{text-align:center;padding:40px;color:var(--txt3);font-size:13px}
.spinner{width:24px;height:24px;border:2px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}

.empty{text-align:center;padding:48px 24px}
.empty-icon{font-size:40px;display:block;margin-bottom:16px}
.empty h3{font-family:'Oswald',sans-serif;font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px}
.empty p{font-size:13px;color:var(--txt2)}

.join-cta{text-align:center;padding:28px 20px;margin:20px 0;border-radius:14px;border:1px dashed rgba(212,168,67,.2);background:rgba(212,168,67,.03)}
.join-cta-title{font-family:'Oswald',sans-serif;font-size:16px;letter-spacing:1px;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
.join-cta-desc{font-size:12px;color:var(--txt2);margin-bottom:16px;line-height:1.6}
.join-cta-btn{display:inline-flex;padding:12px 32px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--fire),#c23a1a);color:#fff;font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;text-decoration:none;transition:transform .2s}
.join-cta-btn:hover{transform:scale(1.03)}

.admin-panel{margin-top:32px;border-top:1px solid var(--border);padding-top:20px}
.admin-toggle{width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--card-bg);color:var(--txt2);font-family:'Oswald',sans-serif;font-weight:600;font-size:13px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .2s}
.admin-toggle:hover{border-color:var(--gold);color:var(--gold)}
.admin-body{margin-top:14px;padding:20px;border-radius:14px;border:1px solid var(--border);background:var(--card-bg)}
.admin-field{margin-bottom:14px}
.admin-field label{display:block;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--txt2);margin-bottom:5px}
.admin-field input{width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--glass);color:var(--txt);font-family:inherit;font-size:13px}
.admin-field input:focus{outline:none;border-color:var(--gold)}

/* Modal */
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
.modal{width:100%;max-width:460px;border-radius:16px;border:1px solid var(--border);background:#1a1a1d;overflow:hidden;max-height:90vh;overflow-y:auto}
.modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}
.modal-title{font-family:'Oswald',sans-serif;font-size:16px;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold)}
.modal-close{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--glass);color:var(--txt2);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.modal-close:hover{border-color:var(--red);color:var(--red)}
.modal-body{padding:20px}
.modal-field{margin-bottom:14px}
.modal-field label{display:block;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--txt2);margin-bottom:5px}
.modal-field input,.modal-field textarea,.modal-field select{width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--glass);color:var(--txt);font-family:inherit;font-size:13px}
.modal-field input:focus,.modal-field textarea:focus{outline:none;border-color:var(--gold)}
.modal-field select{appearance:none;cursor:pointer}
.modal-field textarea{resize:vertical;line-height:1.5}
.modal-upload{border:1px dashed rgba(74,222,128,.3);border-radius:10px;padding:28px;text-align:center;cursor:pointer;transition:all .2s;background:rgba(74,222,128,.03)}
.modal-upload:hover{border-color:var(--green);background:rgba(74,222,128,.06)}
.modal-upload-icon{font-size:28px;display:block;margin-bottom:8px}
.modal-upload-text{font-size:12px;color:var(--txt);font-weight:600;display:block}
.modal-upload-sub{font-size:11px;color:var(--txt3);display:block;margin-top:4px}
.modal-preview-wrap{border-radius:10px;overflow:hidden;cursor:pointer;position:relative}
.modal-preview-img{width:100%;display:block;border-radius:10px}
.modal-preview-change{position:absolute;bottom:0;left:0;right:0;padding:8px;text-align:center;background:rgba(0,0,0,.6);font-size:11px;color:var(--txt2);font-weight:600}
.submit-status{font-size:12px;color:var(--red);margin-bottom:10px;text-align:center}
.modal-submit{width:100%;padding:14px;border-radius:10px;border:none;margin-top:4px;background:linear-gradient(135deg,var(--green),#22c55e);color:#0a0a0a;font-family:'Oswald',sans-serif;font-weight:700;font-size:14px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:transform .2s}
.modal-submit:hover{transform:scale(1.02)}
.modal-submit:disabled{opacity:.5;cursor:not-allowed;transform:none}

@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.75)}}
@media(max-width:600px){
  .hero{padding:36px 0 16px}
  .hero-title{font-size:clamp(2.4rem,10vw,3.5rem)}
  .sg-val{font-size:18px}
  .bw-payout{font-size:22px}
}
`;
