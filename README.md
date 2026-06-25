RocketMan AI: Adaptive Learner Memory System

An adaptive AI tutoring system built for the Memorang Full-Stack Engineer Skills Exercise. RocketMan doesn't just answer questions; it silently evaluates the learner's understanding in the background, building a persistent semantic memory profile to personalize future interactions.


1. Clone the repository.
2. Copy `.env.example` to `.env.local` and add your keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   GROQ_API_KEY=your_groq_key

Install dependencies:
npm install
Run the development server:
npm run dev
Click "Start Interactive Demo" on the landing page. This triggers a silent authentication flow for a seamless reviewer experience without requiring manual account creation.

System Architecture & Design
To avoid a clunky experience where the user has to wait for the AI to both generate an educational response and evaluate their mastery, the architecture strictly decouples the chat stream from the memory extraction.

The Pipeline:

The Chat Interface (UI): Built with Next.js App Router and the Vercel AI SDK. The component tree is intentionally kept flat, favoring page-level logic and standard shadcn/ui components for a minimal, highly maintainable structure.

The Orchestrator (/api/chat): When a user sends a message, this route fetches their long-term memory profile from Postgres, injects it into the System Prompt for personalization, and instantly streams the AI response back to the UI.

The Background Extractor (memory-service.ts): Once the stream finishes, a non-blocking background task takes the conversation transcript and passes it to Groq (llama-3.3-70b-versatile).

Structured JSON: Groq is forced via Zod schema to extract specific concepts, mastery scores, confidence levels, and direct quote evidence.

The Database: Supabase stores the state and handles the relational mapping between the concepts and the temporal learning events.

Technical Decisions
Groq over Gemini/OpenAI: Swapped to Groq for the background extraction engine. The speed of Llama 3.3 70B ensures the memory database is updated instantly after a chat finishes without hitting standard rate limits, providing a true real-time dashboard update.

Vercel AI SDK v5: Leveraged the latest standard for streaming UI, bypassing deprecated hook properties to manually manage input state for a bug-free, robust chat input that never freezes during hydration or stream interruptions.

Bento-Box Dashboard: Opted for a server-rendered Bento Box UI using Tailwind. It fetches the nested relational data (Concepts + Timeline Events) in a single Supabase query for zero-loading-state performance.

Database Schema (Supabase / Postgres)
messages: Persists the chat history for continuous context across sessions.

concept_memories: Stores the current state of a learned concept (Mastered, Weak, etc.), the AI's confidence score, and the exact transcript quote as evidence.

memory_events: An append-only ledger tracking the delta (+/-) in mastery scores over time to construct the visual learning timeline.