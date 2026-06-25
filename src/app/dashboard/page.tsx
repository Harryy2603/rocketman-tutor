// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function getStatusStyle(status) {
  switch (status?.toLowerCase()) {
    case "mastered": return { variant: "outline", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" };
    case "proficient": return { variant: "outline", className: "border-sky-500/30 bg-sky-500/10 text-sky-400" };
    case "developing": return { variant: "outline", className: "border-amber-500/30 bg-amber-500/10 text-amber-400" };
    case "weak": default: return { variant: "outline", className: "border-red-500/30 bg-red-500/10 text-red-400" };
  }
}

function getMasteryBarColor(status) {
  switch (status?.toLowerCase()) {
    case "mastered": return "bg-emerald-500";
    case "proficient": return "bg-sky-500";
    case "developing": return "bg-amber-500";
    default: return "bg-red-500";
  }
}

function MemoryCard({ memory, index }) {
  const statusStyle = getStatusStyle(memory.status);
  const barColor = getMasteryBarColor(memory.status);
  const scoreValue = memory.mastery_score <= 1 ? memory.mastery_score * 100 : memory.mastery_score;
  const confidenceValue = memory.confidence ? Math.round(memory.confidence * 100) : 85; // Default if old data
  const isWide = index % 7 === 0 || index % 7 === 4;

  return (
    <Card className={`group relative overflow-hidden bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.13] transition-all duration-300 ${isWide ? "md:col-span-2" : ""}`}>
      <div className={`absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${barColor}`} style={{ background: `linear-gradient(90deg, transparent, currentColor, transparent)` }} />
      
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-white/90 font-semibold text-sm leading-snug truncate flex-1">{memory.concept_name}</h3>
          <Badge variant={statusStyle.variant} className={`${statusStyle.className} text-[10px] font-medium px-2 py-0.5 capitalize`}>
            {memory.status || "unknown"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 flex flex-col gap-4">
        {/* Mastery & Confidence Row */}
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-4">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">Mastery</span>
              <span className="text-xs font-semibold text-white/60 tabular-nums">{scoreValue}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, scoreValue))}%` }} />
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium mb-1">AI Confidence</span>
            <span className="text-xs font-mono text-indigo-400">{confidenceValue}%</span>
          </div>
        </div>

        {/* Dynamic Evidence */}
        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">Chat Evidence</span>
          <p className="text-white/60 text-xs italic">"{memory.evidence || "No evidence recorded yet."}"</p>
        </div>

        {/* Learning Timeline (Feature 4) */}
        {memory.memory_events && memory.memory_events.length > 0 && (
          <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-white/[0.05]">
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">Learning Timeline</span>
            <div className="space-y-2">
              {memory.memory_events.slice(0, 3).map((event, idx) => {
                const date = new Date(event.created_at || new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const isPositive = event.score_delta > 0;
                return (
                  <div key={idx} className="flex items-center gap-3 text-xs">
                    <span className="text-white/30 font-mono w-12">{date}</span>
                    <span className={`font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isPositive ? '+' : ''}{event.score_delta}
                    </span>
                    <span className="text-white/40 truncate">{event.reasoning || 'Assessment updated'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

  // Fetch concepts AND their nested timeline events in one query
  const { data: memories } = await supabase
    .from("concept_memories")
    .select("*, memory_events(*)")
    .eq("user_id", userId)
    .order('updated_at', { ascending: false });

  const safeMemories = memories || [];

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 right-1/4 w-[500px] h-[300px] rounded-full bg-indigo-600/8 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#080808]/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <h1 className="text-sm font-medium tracking-tight text-white/40 font-mono">ROCKETMAN / Dashboard</h1>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white/90 mb-1">Learner Memory</h1>
          <p className="text-sm text-white/35">Your adaptive mastery profile and learning timeline.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {safeMemories.map((memory, index) => (
            <MemoryCard key={memory.id} memory={memory} index={index} />
          ))}
        </div>
      </main>
    </div>
  );
}