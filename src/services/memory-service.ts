import { createClient } from '@/lib/supabase/server';
import Groq from 'groq-sdk';
import { z } from 'zod';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ConceptSchema = z.object({
  concepts: z.array(z.object({
    concept_name: z.string(),
    status: z.enum(['weak', 'developing', 'proficient', 'mastered']),
    mastery_score: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
    evidence_source: z.enum(['student', 'inferred']),
    evidence: z.array(z.string()).min(1),
  }))
});

const MIN_CONFIDENCE_FOR_INFERRED = 0.6;

export async function extractAndSaveMemories(conversationId: string, userId: string) {
  console.log('\n[Memory] Starting extraction for conv:', conversationId);
  const supabase = await createClient();

  const { data: messages, error: fetchError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('[Memory] Failed to fetch messages:', fetchError.message);
    return;
  }
  if (!messages || messages.length === 0) {
    console.log('[Memory] No messages found for conversationId:', conversationId);
    return;
  }

  console.log('[Memory] Found', messages.length, 'messages to analyze');

  // Label each line clearly so the LLM can distinguish who said what
  const transcript = messages
    .map(m => `[${m.role === 'user' ? 'STUDENT' : 'TUTOR'}]: ${m.content}`)
    .join('\n\n');

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a learning analytics system that builds a student's knowledge profile from tutoring transcripts.

Your job is to assess what the STUDENT knows — NOT what the TUTOR explained.

CRITICAL RULES:
1. Only include a concept if the STUDENT gave evidence of knowing or not knowing it.
   - The student asking a question about X = weak signal (low mastery, low confidence).
   - The student explaining X correctly = strong signal (higher mastery).
   - The student saying "I know X" explicitly = strong prior knowledge signal.
   - The TUTOR explaining X, with NO student response about it = DO NOT include it, or mark evidence_source as "inferred" with very low confidence (< 0.4).

2. evidence must be a direct quote from a STUDENT message, not the tutor's explanation.
   If you cannot find a student quote for a concept, set evidence_source to "inferred"
   and quote the student's original request that implied the gap.

3. mastery_score guidelines:
   - Student explicitly claims prior knowledge ("I know what X is"): 70–90
   - Student asks a clear question showing they want to learn X: 10–25
   - Student follows up with a deeper question about X: 30–50 (developing)
   - Student correctly explains X themselves: 60–85
   - TUTOR mentioned X in passing, student never reacted: 0–20, evidence_source = "inferred"

4. confidence reflects how certain you are of your assessment (0–1).
   Low confidence (< 0.5) = little student evidence. High confidence (> 0.7) = clear student signal.

5. Do NOT inflate scores. A student who just heard about a concept for the first time
   should NOT be scored above 30 on that concept.

6. evidence is a JSON ARRAY of short direct quotes from STUDENT messages only.
   - Always use an array, even for a single quote: ["quote here"]
   - If the student said multiple things about a concept across the conversation,
     include each as a separate array element: ["first quote", "later quote"]
   - NEVER put multiple quotes in one string. NEVER use commas between quoted strings.
   - Each element must be a valid JSON string — no trailing commas, no extra keys.

Return valid JSON in exactly this format:
{
  "concepts": [
    {
      "concept_name": "string",
      "status": "weak|developing|proficient|mastered",
      "mastery_score": number 0–100,
      "confidence": number 0–1,
      "evidence_source": "student|inferred",
      "evidence": ["quote one from student", "quote two from student"]
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Analyze this tutoring transcript and extract the student's concept mastery profile.\nOnly assess what the STUDENT demonstrated — not what the TUTOR taught.\n\n${transcript}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    console.log('[Memory] Raw response:', raw.slice(0, 300));

    const parsed = JSON.parse(raw);
    const validated = ConceptSchema.parse(parsed);

    console.log(`[Memory] Extracted ${validated.concepts.length} concepts`);

    for (const concept of validated.concepts) {
      // Skip AI-only concepts that don't meet the confidence bar
      if (
        concept.evidence_source === 'inferred' &&
        concept.confidence < MIN_CONFIDENCE_FOR_INFERRED
      ) {
        console.log(
          `[Memory] Skipped (inferred, low confidence): ${concept.concept_name} (conf: ${concept.confidence})`
        );
        continue;
      }

      const normalizedName = concept.concept_name
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());

      const { data: existingRows, error: lookupError } = await supabase
        .from('concept_memories')
        .select('*')
        .eq('user_id', userId)
        .ilike('concept_name', normalizedName)
        .limit(1);

      if (lookupError) {
        console.error(`[Memory] Lookup error for "${normalizedName}":`, lookupError.message);
        continue;
      }

      const existing = existingRows?.[0] ?? null;

      // Flatten evidence array to a single string for storage
      const evidenceText = concept.evidence.join(' → ');

      if (existing) {
        const scoreDelta = concept.mastery_score - existing.mastery_score;
        await supabase
          .from('concept_memories')
          .update({
            status: concept.status,
            mastery_score: concept.mastery_score,
            evidence: evidenceText,
            confidence: concept.confidence,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        await supabase.from('memory_events').insert({
          memory_id: existing.id,
          conversation_id: conversationId,
          score_delta: scoreDelta,
          reasoning: evidenceText,
        });
        console.log('[Memory] Updated:', normalizedName);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('concept_memories')
          .insert({
            user_id: userId,
            concept_name: normalizedName,
            status: concept.status,
            mastery_score: concept.mastery_score,
            evidence: evidenceText,
            confidence: concept.confidence,
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[Memory] Insert error for "${normalizedName}":`, insertError.message);
          continue;
        }

        if (inserted) {
          await supabase.from('memory_events').insert({
            memory_id: inserted.id,
            conversation_id: conversationId,
            score_delta: concept.mastery_score,
            reasoning: 'Initial assessment.',
          });
          console.log('[Memory] Inserted:', normalizedName);
        }
      }
    }
    console.log('[Memory] Extraction complete!');
  } catch (error) {
    console.error('[Memory] Extraction failed:', error);
  }
}